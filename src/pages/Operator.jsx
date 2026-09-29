import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, CircleX, Filter, MapPin, Radar, Search, Send, WalletCards } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button, ConfirmDialog, Input } from "../components/ui/Controls.jsx";
import { exchangeApi } from "../lib/exchangeApi.js";

function getLocalDateTimeMin(offsetMinutes = 5) {
  const date = new Date(Date.now() + offsetMinutes * 60 * 1000);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function Operator() {
  const [orders, setOrders] = useState([]);
  const [offerForms, setOfferForms] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [onlyNew, setOnlyNew] = useState(false);
  const [offerErrors, setOfferErrors] = useState({});
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const minDateTime = getLocalDateTimeMin();
  const navigate = useNavigate();

  async function load() {
    try { setOrders(await exchangeApi.orders()); setError(""); }
    catch (loadError) { setError(loadError.message || "Не удалось загрузить биржу."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); const timer = setInterval(load, 30000); return () => clearInterval(timer); }, []);

  async function offer(order) {
    const form = offerForms[order.id] || {};
    const nextErrors = {};
    if (!form.price || Number(form.price) <= 0) nextErrors.price = "Укажите стоимость больше нуля.";
    const scheduled = form.date ? new Date(form.date) : null;
    if (!scheduled || Number.isNaN(scheduled.getTime()) || scheduled.getTime() <= Date.now()) nextErrors.date = "Выберите будущие дату и время.";
    if (Object.keys(nextErrors).length) { setOfferErrors((items) => ({ ...items, [order.id]: nextErrors })); setError("Проверьте данные предложения."); return; }
    setOfferErrors((items) => ({ ...items, [order.id]: {} }));
    try {
      const createdOffer = await exchangeApi.createOffer(order.id, { price: Number(form.price), scheduled_date: scheduled.toISOString(), comment: form.comment || "" });
      setOrders((items) => items.map((item) => item.id === order.id ? { ...item, my_offer_id: createdOffer?.id || null, my_offer_status: "pending", my_offer_price: createdOffer?.price ?? Number(form.price), my_offer_scheduled_date: createdOffer?.scheduled_date || scheduled.toISOString(), my_offer_comment: createdOffer?.comment || form.comment || "", my_offer_created_at: createdOffer?.created_at || new Date().toISOString(), offers_count: Number(item.offers_count || 0) + 1 } : item));
      setOfferForms((items) => ({ ...items, [order.id]: {} }));
      setOfferErrors((items) => ({ ...items, [order.id]: {} }));
      setError("");
    } catch (offerError) { setError(offerError.message || "Не удалось отправить отклик."); }
  }

  async function cancelOffer(order) {
    if (!order?.my_offer_id) return;
    setCancelBusy(true);
    setCancelError("");
    try {
      await exchangeApi.cancelOffer(order.id, order.my_offer_id);
      setOrders((items) => items.map((item) => item.id === order.id ? { ...item, my_offer_id: null, my_offer_status: null, my_offer_price: null, my_offer_scheduled_date: null, my_offer_comment: null, my_offer_created_at: null, offers_count: Math.max(0, Number(item.offers_count || 0) - 1) } : item));
      setCancelTarget(null);
    } catch (cancelRequestError) {
      setCancelError(cancelRequestError.message || "Не удалось отменить отклик.");
    } finally {
      setCancelBusy(false);
    }
  }

  const visibleOrders = useMemo(() => orders.filter((order) => {
    const needle = query.trim().toLowerCase();
    return (!needle || `${order.field_name} ${order.task} ${order.description}`.toLowerCase().includes(needle)) && (!onlyNew || !order.my_offer_status);
  }), [orders, query, onlyNew]);

  if (loading) return <div className="loading-state glass-card"><div className="loading-pulse" /><span>Загружаем заказы…</span></div>;

  return <>
    <section className="workspace-hero glass-card"><div className="workspace-hero-main"><span className="eyebrow">ОПЕРАТОР</span><h1>Доступные заказы</h1><p>Находите подходящие задания, отправляйте своё предложение и берите в работу только подходящие полёты.</p><div className="hero-inline-actions"><Link className="primary-button-link" to="/operator/tasks">Мои задания <ArrowRight size={15} /></Link></div></div><div className="workspace-hero-side"><div className="workspace-stat"><strong>{orders.length}</strong><span>открытых</span></div><div className="workspace-stat"><strong>{orders.filter((item) => item.my_offer_status).length}</strong><span>мои отклики</span></div><div className="workspace-stat"><strong>{orders.filter((item) => item.status === "pending").length}</strong><span>свободных</span></div></div></section>
    {error && <div className="form-error page-alert" role="alert">{error}</div>}
    <section className="market-toolbar glass-card"><div className="search-field"><Search size={17} /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по полю или типу работы" aria-label="Поиск заказов" /></div><button type="button" className={`toolbar-filter ${onlyNew ? "active" : ""}`} onClick={() => setOnlyNew((value) => !value)}><Filter size={14} /> Без моего отклика</button></section>
    <section className="section-block"><div className="section-heading"><div><span className="eyebrow">БИРЖА</span><h2>Доступные заказы</h2></div><span className="counter-badge">{visibleOrders.length} доступно</span></div><div className="market-grid">{visibleOrders.length ? visibleOrders.map((order) => { const sent=Boolean(order.my_offer_status); const form=offerForms[order.id]||{}; return <article className={`market-card glass-card ${sent ? "has-offer" : ""}`} key={order.id}><div className="market-card-top"><div className="list-icon"><Radar size={18} /></div><span className={`status-badge ${sent ? "status-offer" : "status-pending"}`}>{sent ? "Отклик отправлен" : "Новый заказ"}</span></div><div className="market-title"><strong>{order.field_name}</strong><span>{order.task} · {Number(order.area || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} га</span></div>{order.description && <p>{order.description}</p>}<div className="market-meta">{order.field_region && <span><MapPin size={13} /> {order.field_region}</span>}<span><WalletCards size={13} /> {order.offers_count || 0} откликов</span></div>{sent ? <div className="offer-sent-panel"><CheckCircle2 size={18} /><div><strong>Ваш отклик отправлен</strong><span>{Number(order.my_offer_price || 0).toLocaleString("ru-RU")} ₽ · {order.my_offer_scheduled_date ? new Date(order.my_offer_scheduled_date).toLocaleString("ru-RU", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" }) : "Дата уточняется"}</span>{order.my_offer_comment && <span>{order.my_offer_comment}</span>}</div><div className="offer-sent-actions"><Button mode="secondary" onClick={() => navigate(`/operator/orders/${order.id}`)} iconAfter={<ArrowRight size={14} />}>Открыть</Button>{order.my_offer_status === "pending" && <Button mode="danger" onClick={() => { setCancelError(""); setCancelTarget(order); }} iconBefore={<CircleX size={14} />}>Отменить</Button>}</div></div> : <div className="offer-form"><div className="two-col"><label className="field-label">Стоимость, ₽<Input type="number" min="1" placeholder="15000" value={form.price || ""} onChange={(event) => { setOfferForms({ ...offerForms, [order.id]: { ...form, price: event.target.value } }); setOfferErrors((items) => ({ ...items, [order.id]: { ...(items[order.id] || {}), price: "" } })); }} aria-invalid={Boolean(offerErrors[order.id]?.price)} />{offerErrors[order.id]?.price && <span className="field-error">{offerErrors[order.id].price}</span>}</label><label className="field-label">Дата / время<Input className={offerErrors[order.id]?.date ? "input-invalid" : ""} type="datetime-local" min={minDateTime} value={form.date || ""} onChange={(event) => { setOfferForms({ ...offerForms, [order.id]: { ...form, date: event.target.value } }); setOfferErrors((items) => ({ ...items, [order.id]: { ...(items[order.id] || {}), date: "" } })); }} aria-invalid={Boolean(offerErrors[order.id]?.date)} />{offerErrors[order.id]?.date && <span className="field-error">{offerErrors[order.id].date}</span>}</label></div><Input placeholder="Комментарий фермеру" value={form.comment || ""} onChange={(event) => setOfferForms({ ...offerForms, [order.id]: { ...form, comment: event.target.value } })} /><div className="offer-form-actions"><Button mode="primary" onClick={() => offer(order)} iconAfter={<Send size={14} />}>Отправить отклик</Button><Button mode="secondary" onClick={() => navigate(`/operator/orders/${order.id}`)} iconAfter={<ArrowRight size={14} />}>Подробнее</Button></div></div>}</article>; }) : <div className="empty-state glass-card market-empty"><CheckCircle2 size={32} /><h2>{orders.length ? "Ничего не найдено" : "Свободных заказов нет"}</h2><p>Измените поиск или вернитесь позже.</p>{!orders.length && <Link to="/operator/tasks" className="primary-link">Мои активные задания</Link>}</div>}</div></section>
    <ConfirmDialog
      open={Boolean(cancelTarget)}
      title="Отменить отклик?"
      description={cancelTarget ? `Ваш отклик на заказ «${cancelTarget.field_name}» будет отменён. После этого его можно будет отправить заново.` : ""}
      confirmLabel="Отменить отклик"
      icon={<CircleX size={21} />}
      busy={cancelBusy}
      danger
      onCancel={() => !cancelBusy && setCancelTarget(null)}
      onConfirm={() => cancelOffer(cancelTarget)}
    >
      {cancelError && <div className="confirm-dialog-error" role="alert">{cancelError}</div>}
    </ConfirmDialog>
  </>
}
