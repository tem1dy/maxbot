import { useEffect, useState } from "react";
import { Button, ConfirmDialog, Input } from "../../components/ui/Controls.jsx";
import { ArrowLeft, CalendarDays, CheckCircle2, CircleX, Map, MapPin, Radar, Send, WalletCards, MoreHorizontal } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { exchangeApi } from "../../lib/exchangeApi.js";
import { YandexFieldPreview } from "../../components/map/YandexFieldPreview.jsx";
import { notifyMax } from "../../lib/maxBridge.js";

function getLocalDateTimeMin(offsetMinutes = 5) {
  const date = new Date(Date.now() + offsetMinutes * 60 * 1000);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function OperatorOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [form, setForm] = useState({ price: "", date: "", comment: "" });
  const minDateTime = getLocalDateTimeMin();
  const [error, setError] = useState("");
  const [dateError, setDateError] = useState("");
  const [priceError, setPriceError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const ownOffer = order?.my_offer_status;

  useEffect(() => {
    const backButton = window.WebApp?.BackButton || window.Max?.WebApp?.BackButton;
    if (backButton) {
      backButton.show?.();
      const handleBack = () => navigate(-1);
      backButton.onClick?.(handleBack);
      return () => {
        backButton.offClick?.(handleBack);
        backButton.hide?.();
      };
    }
  }, [navigate]);

  useEffect(() => {
    exchangeApi.order(id).then(setOrder).catch((loadError) => setError(loadError.message || "Не удалось загрузить заказ."));
  }, [id]);

  const isOpen = order?.status === "pending";
  function parseLocalDateTime(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes] = timePart.split(":").map(Number);
  const candidate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (candidate.getFullYear() !== year || candidate.getMonth() !== month - 1 || candidate.getDate() !== day || candidate.getHours() !== hours || candidate.getMinutes() !== minutes) return null;
  return candidate;
}
function localDateTimeToIso(value) { const date = parseLocalDateTime(value); return date ? date.toISOString() : ""; }

async function cancelOwnOffer() {
    if (!order?.my_offer_id || order.my_offer_status !== "pending") return;
    setCancelBusy(true);
    setCancelError("");
    try {
      await exchangeApi.cancelOffer(id, order.my_offer_id);
      setOrder((current) => current ? { ...current, my_offer_id: null, my_offer_status: null, my_offer_price: null, my_offer_scheduled_date: null, my_offer_comment: null, my_offer_created_at: null } : current);
      setCancelOpen(false);
    } catch (cancelRequestError) {
      setCancelError(cancelRequestError.message || "Не удалось отменить отклик.");
    } finally {
      setCancelBusy(false);
    }
  }

async function submitOffer(event) {
    event.preventDefault();
    const nextPriceError = !form.price || !Number.isFinite(Number(form.price)) || Number(form.price) <= 0 ? "Введите стоимость выполнения больше 0 ₽." : "";
    setPriceError(nextPriceError);
    if (nextPriceError) { setError(nextPriceError); return; }
    if (!form.date) { setDateError("Укажите дату и время выполнения."); setError("Проверьте дату и время выполнения."); return; }
    const parsedDate = parseLocalDateTime(form.date);
    if (!parsedDate) { setDateError("Укажите корректную дату и время."); setError("Проверьте дату и время выполнения."); return; }
    if (parsedDate.getTime() <= Date.now()) { setDateError("Выберите будущие дату и время."); setError("Проверьте дату и время выполнения."); return; }
    setDateError("");
    setBusy(true); setError("");
    try {
      const scheduledDate = localDateTimeToIso(form.date);
      if (!scheduledDate) { setDateError("Проверьте дату и время выполнения."); setError("Проверьте дату и время выполнения."); return; }
      await exchangeApi.createOffer(id, { price: Number(form.price), scheduled_date: scheduledDate, comment: form.comment });
      notifyMax("success");
      navigate("/operator", { replace: true });
    } catch (submitError) { setError(submitError.message || "Не удалось отправить отклик."); }
    finally { setBusy(false); }
  }

  if (!order) return <div className="loading-state glass-card">{error || "Загружаем заказ…"}</div>;

  return <>
    <div className="back-row"><button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={16} /> Назад</button><div className="order-detail-top-actions"><span className={`status-badge status-${order.status}`}>{isOpen ? "Свободен" : order.status_label}</span><div className="order-menu"><button type="button" className="icon-button order-menu-trigger" aria-label="Действия с заказом" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}><MoreHorizontal size={18}/></button>{menuOpen && <div className="order-menu-popover order-menu-popover-right" role="menu"><button type="button" onClick={() => { setMenuOpen(false); navigate("/operator"); }}>Вернуться на биржу</button><button type="button" onClick={() => { setMenuOpen(false); navigate("/operator/tasks"); }}>Мои задания</button></div>}</div></div></div>
    <section className="page-title-row compact-title"><div><span className="eyebrow">БИРЖА / {order.id.slice(0, 8).toUpperCase()}</span><h1>{order.field_name}</h1><div className="page-subtitle">{order.task}</div><p className="page-lead">{Number(order.area || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} га{order.field_region ? ` · ${order.field_region}` : ""} · заказ от {order.farmer_name || "фермера"}</p></div></section>
    {error && <div className="form-error page-alert" role="alert">{error}</div>}

    <section className="detail-grid">
      <div className="glass-card detail-card"><div className="detail-card-head"><div className="mini-icon"><Radar size={18} /></div><div><span className="eyebrow">ЗАДАЧА</span><strong>Что нужно выполнить</strong></div></div><div className="detail-pairs"><div><span>Тип работ</span><strong>{order.task}</strong></div><div><span>Площадь</span><strong>{Number(order.area || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} га</strong></div><div><span>Комментарий</span><strong>{order.description || "Без дополнительных требований"}</strong></div></div></div>
      <div className="glass-card detail-card"><div className="detail-card-head"><div className="mini-icon"><Map size={18} /></div><div><span className="eyebrow">ПОЛЕ</span><strong>{order.field_crop || "Сельхозучасток"}</strong></div></div>{order.field_geometry ? <YandexFieldPreview geometry={order.field_geometry} /> : <div className="detail-map-placeholder detail-map-location"><MapPin size={28} /><span>Граница участка не была сохранена. Уточните точку выезда с фермером до выполнения.</span></div>}</div>
    </section>

    {ownOffer && <section className="glass-card accepted-offer-panel"><div className="accepted-offer-icon"><CheckCircle2 size={20} /></div><div className="accepted-offer-content"><span className="eyebrow">ВАШ ОТКЛИК</span><strong>{order.my_offer_status === "pending" ? "Отклик уже отправлен" : order.my_offer_status === "accepted" ? "Ваше предложение выбрано" : "Отклик недоступен"}</strong><span className="accepted-offer-meta">{Number(order.my_offer_price || 0) > 0 ? `${Number(order.my_offer_price).toLocaleString("ru-RU")} ₽` : "Цена по договорённости"}<span className="accepted-offer-dot">·</span>{order.my_offer_scheduled_date ? new Date(order.my_offer_scheduled_date).toLocaleString("ru-RU", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" }) : "Дата уточняется"}</span>{order.my_offer_comment && <span className="accepted-offer-comment">{order.my_offer_comment}</span>}<span className="accepted-offer-note">{order.my_offer_status === "pending" ? "Фермер ещё принимает решение." : order.my_offer_status === "accepted" ? "Фермер выбрал ваше предложение. Заказ перешёл в работу." : "Этот отклик больше не участвует в выборе."}</span></div>{order.my_offer_status === "pending" && isOpen && <Button mode="danger" onClick={() => { setCancelError(""); setCancelOpen(true); }} iconBefore={<CircleX size={15} />}>Отменить отклик</Button>}</section>}

    {!ownOffer && isOpen ? <form className="glass-card operator-apply operator-offer-form" onSubmit={submitOffer} noValidate><div><span className="eyebrow">ВАШЕ ПРЕДЛОЖЕНИЕ</span><h2>Отправить предложение</h2><p>Фермер увидит стоимость, доступное время и ваш комментарий. После выбора заказ появится в «Заданиях».</p></div><div className="offer-form-grid"><label className={`field-label ${priceError ? "has-error" : ""}`}>Стоимость, ₽<Input className={priceError ? "input-invalid" : ""} type="number" min="1" value={form.price} onChange={(event) => { setForm({ ...form, price: event.target.value }); setPriceError(""); if (error) setError(""); }} placeholder="15000" required />{priceError && <span className="field-error">{priceError}</span>}</label><label className="field-label">Дата / время<Input className={dateError ? "input-invalid" : ""} type="datetime-local" min={minDateTime} value={form.date} onChange={(event) => { setForm({ ...form, date: event.target.value }); setDateError(""); if (error) setError(""); }} aria-invalid={Boolean(dateError)} required />{dateError && <span className="field-error">{dateError}</span>}</label><label className="field-label offer-comment-field">Комментарий<Input value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} placeholder="Готов выехать утром, оборудование Mavic 3M" /></label></div><div className="operator-apply-actions"><span><CalendarDays size={14} /> Можно договориться после отклика</span><span><WalletCards size={14} /> Окончательную цену выбирает фермер</span><Button mode="primary" size="large" type="submit" disabled={busy} iconAfter={<Send size={15} />}>{busy ? "Отправляем…" : "Отправить отклик"}</Button></div></form> : !ownOffer && <section className="glass-card operator-apply"><div><span className="eyebrow">СТАТУС ЗАКАЗА</span><h2>Заказ уже недоступен</h2><p>Другой оператор уже взял заказ или он был завершён.</p></div><Button mode="secondary" onClick={() => navigate("/operator/tasks")}>Мои задания</Button></section>}
    <ConfirmDialog
      open={cancelOpen}
      title="Отменить отклик?"
      description="Ваше предложение будет снято с рассмотрения фермером. После отмены вы сможете отправить новый отклик, пока заказ остаётся свободным."
      confirmLabel="Отменить отклик"
      icon={<CircleX size={21} />}
      busy={cancelBusy}
      danger
      onCancel={() => !cancelBusy && setCancelOpen(false)}
      onConfirm={cancelOwnOffer}
    >
      {cancelError && <div className="confirm-dialog-error" role="alert">{cancelError}</div>}
    </ConfirmDialog>
  </>;
}
