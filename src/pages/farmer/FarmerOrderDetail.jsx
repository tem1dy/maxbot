import { useEffect, useState } from "react";
import { Button, ConfirmDialog, Input } from "../../components/ui/Controls.jsx";
import { ArrowLeft, CheckCircle2, Clock3, FileBox, Map, MessageCircle, Radar, Share2, WalletCards, UserRound, ArrowRight, AlertTriangle, MoreHorizontal } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { exchangeApi } from "../../lib/exchangeApi.js";
import { YandexFieldPreview } from "../../components/map/YandexFieldPreview.jsx";
import { notifyMax, shareMaxContent } from "../../lib/maxBridge.js";

export function FarmerOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [offers, setOffers] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function load() {
    try {
      const item = await exchangeApi.order(id);
      setOrder(item);
      setOffers(item.status === "pending" ? await exchangeApi.offers(id) : []);
    } catch (loadError) { setError(loadError.message || "Не удалось загрузить заказ."); }
  }
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
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [id]);

  async function shareOrder() {
    const text = `Поле рядом · ${order?.field_name}\n${order?.task} · ${Number(order?.area || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} га\nСтатус: ${order?.status_label}`;
    try {
      let link = window.location.href;
      if (order?.status === "completed") {
        try {
          const completedResults = await exchangeApi.results();
          const currentResult = completedResults.find((item) => item.order_id === order.id);
          if (currentResult?.report_share_url) {
            link = new URL(currentResult.report_share_url, window.location.origin).href;
          }
        } catch {}
      }
      await shareMaxContent({ text, link });
      notifyMax("success");
    } catch {

    }
  }

  async function cancelOrder() {
    if (!order || !["pending", "in_progress"].includes(order.status)) return;
    setBusy("cancel"); setError("");
    try {
      await exchangeApi.cancelOrder(order.id, cancelReason);
      notifyMax("success");
      navigate("/farmer/orders", { replace: true });
      return true;
    } catch (cancelError) {
      setError(cancelError.message || "Не удалось отменить заказ.");
      return false;
    } finally { setBusy(""); }
  }

  async function accept(offer) {
    setBusy(offer.id); setError("");
    try { await exchangeApi.acceptOffer(id, offer.id); await load(); }
    catch (acceptError) { setError(acceptError.message || "Не удалось принять предложение."); }
    finally { setBusy(""); }
  }

  if (!order) return <div className="loading-state glass-card">{error || "Загружаем заказ…"}</div>;
  const progress = order.status === "pending" ? 2 : order.status === "in_progress" ? 3 : order.status === "completed" ? 4 : 0;
  const currentStage = progress === 4 ? "Результат" : progress === 3 ? "Полёт" : progress === 2 ? "Заказ" : "Отменён";
  return <>
    <div className="back-row"><button className="back-link" onClick={() => navigate(-1)}><ArrowLeft size={16} /> Назад</button><span className={`status-badge status-${order.status}`}>{order.status_label}</span></div>
    <section className="page-title-row compact-title"><div><span className="eyebrow">ЗАКАЗ · {order.id.slice(0, 8).toUpperCase()}</span><h1>{order.field_name}</h1><div className="page-subtitle">{order.task}</div><p className="page-lead">{Number(order.area || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} га · создан {new Date(order.created_at).toLocaleDateString("ru-RU")}</p></div><div className="order-title-actions"><Button mode="secondary" onClick={shareOrder} iconBefore={<Share2 size={16} />}>Поделиться</Button>{["pending","in_progress"].includes(order.status) && <Button mode="danger" onClick={() => { setCancelReason(""); setCancelOpen(true); }} disabled={busy === "cancel"}>{busy === "cancel" ? "Отменяем…" : "Отменить заказ"}</Button>}<div className="order-menu"><button type="button" className="icon-button order-menu-trigger" aria-label="Действия с заказом" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}><MoreHorizontal size={18}/></button>{menuOpen && <div className="order-menu-popover" role="menu"><button type="button" onClick={() => { setMenuOpen(false); navigate("/farmer/orders"); }}>К списку заказов</button><button type="button" onClick={() => { setMenuOpen(false); shareOrder(); }}>Поделиться</button></div>}</div></div></section>
    {error && <div className="form-error page-alert" role="alert">{error}</div>}

    <section className="order-status-summary glass-card"><div className="order-status-summary-main"><span className="eyebrow">СТАТУС ЗАКАЗА</span><strong>{order.status === "pending" ? "Ищем исполнителя" : order.status === "in_progress" ? "Заказ в работе" : order.status === "completed" ? "Результат готов" : "Заказ отменён"}</strong><p>{order.status === "pending" ? "Операторы видят заказ и могут отправить предложение." : order.status === "in_progress" ? `Исполнитель: ${order.operator_name || "оператор"}.` : order.status === "completed" ? "Материалы облёта доступны в разделе результатов." : "Заказ закрыт и больше не участвует в подборе исполнителя."}</p></div><div className="order-status-meta"><div><span>Поле</span><strong>{order.field_name}</strong></div><div><span>Площадь</span><strong>{Number(order.area || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} га</strong></div><div><span>Этап</span><strong>{currentStage}</strong></div></div></section>

    <section className="detail-grid">
      <div className="glass-card detail-card"><div className="detail-card-head"><div className="mini-icon"><Radar size={18} /></div><div><span className="eyebrow">ПАРАМЕТРЫ</span><strong>Условия заказа</strong></div></div><div className="detail-pairs"><div><span>Тип задачи</span><strong>{order.task}</strong></div><div><span>Площадь</span><strong>{Number(order.area || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} га</strong></div>{order.field_crop && <div><span>Культура</span><strong>{order.field_crop}</strong></div>}<div><span>Описание</span><strong>{order.description || "Без дополнительных пожеланий"}</strong></div></div></div>
      <div className="glass-card detail-card"><div className="detail-card-head"><div className="mini-icon"><Map size={18} /></div><div><span className="eyebrow">ПОЛЕ</span><strong>Граница участка</strong></div></div><YandexFieldPreview geometry={order.field_geometry} /></div>
    </section>

    {order.status === "pending" && <section className="section-block"><div className="section-heading"><div><span className="eyebrow">ОТКЛИКИ ОПЕРАТОРОВ</span><h2>Выберите исполнителя</h2></div><span className="counter-badge">{offers.length} откликов</span></div><div className="offers-detail glass-card">{offers.length ? offers.map((offer) => <div className="offer-detail-row" key={offer.id}><div className="offer-avatar"><UserRound size={17} /></div><div className="offer-detail-main"><strong>{offer.operator_name || "Оператор MAX"}</strong><span>{offer.comment || "Готов выполнить заказ."}</span><small><Clock3 size={12} /> {offer.scheduled_date ? new Date(offer.scheduled_date).toLocaleString("ru-RU", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" }) : "Дата уточняется"}</small>{offer.operator_username && <small className="offer-username">@{offer.operator_username}</small>}</div><div className="offer-detail-price"><WalletCards size={15} /><strong>{Number(offer.price).toLocaleString("ru-RU")} ₽</strong></div><Button mode="secondary" onClick={() => accept(offer)} disabled={busy === offer.id}>{busy === offer.id ? "Выбираем…" : "Выбрать"}</Button></div>) : <div className="empty-state compact-empty"><MessageCircle size={28} /><h3>Пока нет откликов</h3><p className="page-lead">Оставьте заказ открытым, операторы увидят его на бирже.</p></div>}</div></section>}

    {order.status === "in_progress" && <><section className="accepted-terms glass-card"><div className="accepted-terms-icon"><WalletCards size={18} /></div><div><span className="eyebrow">ДОГОВОРЁННОСТИ</span><strong>{Number(order.accepted_offer_price || 0) > 0 ? `${Number(order.accepted_offer_price).toLocaleString("ru-RU")} ₽` : "По договорённости"}</strong><span>{order.operator_name || "Оператор MAX"}{order.operator_username ? ` · @${order.operator_username}` : ""}</span><span>{order.accepted_offer_scheduled_date ? new Date(order.accepted_offer_scheduled_date).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "Дата уточняется"} · {Number(order.area || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} га</span>{order.accepted_offer_comment && <span>{order.accepted_offer_comment}</span>}</div></section><section className="completion-banner glass-card"><CheckCircle2 size={22} /><div><strong>{order.operator_name || "Оператор"} уже выполняет заказ</strong><span>Когда материалы будут загружены, здесь появится готовый результат.</span></div><Link to="/farmer/results">Мои результаты <ArrowRight size={13} /></Link></section></>}
    {order.status === "completed" && <section className="completion-banner glass-card"><FileBox size={22} /><div><strong>Результат готов</strong><span>Материалы облёта сохранены и доступны в разделе результатов.</span></div><Link to="/farmer/results">Открыть результат <ArrowRight size={13} /></Link></section>}
    <ConfirmDialog
      open={cancelOpen}
      title="Отменить заказ?"
      description="Заказ перестанет быть доступен операторам, а текущие отклики будут закрыты. Это действие нельзя отменить."
      confirmLabel="Отменить заказ"
      icon={<AlertTriangle size={21} />}
      busy={busy === "cancel"}
      onCancel={() => !busy && setCancelOpen(false)}
      onConfirm={async () => { const ok = await cancelOrder(); if (ok) setCancelOpen(false); }}
    >
      <label className="confirm-dialog-field">Причина <span>необязательно</span><Input value={cancelReason} maxLength={500} onChange={(event) => setCancelReason(event.target.value)} placeholder="Например: изменились сроки работ" /></label>
    </ConfirmDialog>
  </>;
}
