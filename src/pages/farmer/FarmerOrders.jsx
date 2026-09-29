import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input } from "../../components/ui/Controls.jsx";
import { ArrowRight, ClipboardList, FileBox, Filter, Map, Plus, ScanLine, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { exchangeApi } from "../../lib/exchangeApi.js";

const services = [
  { label: "Облёт поля", icon: ScanLine, note: "Фото и мониторинг" },
  { label: "Ортофотоплан", icon: Map, note: "Карта участка" },
  { label: "3D-реконструкция", icon: FileBox, note: "Объёмная модель" },
];

export function FarmerOrders() {
  const [orders, setOrders] = useState([]);
  const [fields, setFields] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ field_id: "", task: "Облёт поля", description: "" });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [formErrors, setFormErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const loadSequence = useRef(0);

  const load = async () => {
    const requestId = ++loadSequence.current;
    setLoading(true);
    try {
      const [o, f] = await Promise.all([exchangeApi.myOrders(), exchangeApi.fields()]);
      if (requestId !== loadSequence.current) return;
      setOrders(Array.isArray(o) ? o : []);
      setFields(Array.isArray(f) ? f : []);
      setError("");
    } catch (loadError) {
      if (requestId === loadSequence.current) setError(loadError.message || "Не удалось загрузить заказы.");
    } finally {
      if (requestId === loadSequence.current) setLoading(false);
    }
  };
  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("pole:field-created", handler);
    window.addEventListener("pole:field-deleted", handler);
    window.addEventListener("focus", handler);
    return () => {
      window.removeEventListener("pole:field-created", handler);
      window.removeEventListener("pole:field-deleted", handler);
      window.removeEventListener("focus", handler);
    };
  }, []);

  const selectedField = useMemo(() => fields.find((field) => field.id === form.field_id), [fields, form.field_id]);
  const visibleOrders = useMemo(() => orders.filter((order) => {
    const needle = query.trim().toLowerCase();
    const matchesQuery = !needle || `${order.field_name} ${order.task} ${order.description}`.toLowerCase().includes(needle);
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    return matchesQuery && matchesStatus;
  }), [orders, query, statusFilter]);

  async function submit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!form.field_id) nextErrors.field_id = "Выберите сохранённое поле.";
    if (!form.task || !services.some((item) => item.label === form.task)) nextErrors.task = "Выберите тип работы.";
    if (form.description.trim().length > 1000) nextErrors.description = "Комментарий не должен быть длиннее 1000 символов.";
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length) { setError("Проверьте форму перед публикацией."); return; }
    setSubmitting(true); setError("");
    try {
      await exchangeApi.createOrder({ field_id: form.field_id, task: form.task, description: form.description.trim() });
      setForm({ field_id: "", task: "Облёт поля", description: "" }); setFormErrors({}); setShowForm(false); await load();
    } catch (submitError) { setError(submitError.message || "Не удалось разместить заказ."); }
    finally { setSubmitting(false); }
  }

  return <>
    <section className="page-title-row"><div><span className="eyebrow">ЗАКАЗЫ</span><h1>Мои заказы</h1><p className="page-lead">Создавайте заказ по сохранённому полю и следите за статусом и результатом заказа.</p></div><span className="counter-badge">{orders.length} всего</span></section>
    {error && <div className="form-error page-alert" role="alert">{error}</div>}
    <section className="glass-card create-cta"><div><span className="eyebrow">НОВЫЙ ЗАКАЗ</span><strong>Нужен облёт или анализ участка?</strong><p>Выберите поле и тип работы. Площадь подтянется из реестра автоматически.</p></div><Button mode="primary" size="large" onClick={() => setShowForm((value) => !value)} iconBefore={<Plus size={17} />}>{showForm ? "Закрыть" : "Создать заказ"}</Button></section>
    {showForm && <form className="glass-card order-form form-card-wide" onSubmit={submit} noValidate>
      <div className="form-step"><span>01</span><div><strong>Поле</strong><small>Используется сохранённая граница и её рассчитанная площадь.</small></div></div>
      <label className={`field-label ${formErrors.field_id ? "has-error" : ""}`}>Сохранённое поле<select className={formErrors.field_id ? "input-invalid" : ""} value={form.field_id} onChange={(event) => setForm({ ...form, field_id: event.target.value })} required><option value="">Выберите поле…</option>{fields.map((field) => <option key={field.id} value={field.id}>{`Поле №${field.field_number || "—"}${field.name ? ` · ${field.name}` : ""} · ${Number(field.area || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} га`}</option>)}</select>{formErrors.field_id && <span className="field-error">{formErrors.field_id}</span>}</label>
      {selectedField ? <div className="selected-field-summary"><div><span>Поле</span><strong>№{selectedField.field_number || "—"}{selectedField.name ? ` · ${selectedField.name}` : ""}</strong></div><div><span>Культура</span><strong>{selectedField.crop}</strong></div><div><span>Площадь</span><strong>{Number(selectedField.area || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} га</strong></div></div> : <div className="form-context">Выберите сохранённое поле, чтобы продолжить.</div>}
      <div className="form-step"><span>02</span><div><strong>Задача</strong><small>Какой результат должен получить оператор.</small></div></div>
      <div className={`service-grid ${formErrors.task ? "has-group-error" : ""}`}>{services.map(({ label, icon: Icon, note }) => <button type="button" key={label} className={`service-choice ${form.task === label ? "selected" : ""}`} onClick={() => setForm({ ...form, task: label })}><Icon size={19} /><strong>{label}</strong><span>{note}</span></button>)}</div>{formErrors.task && <span className="field-error form-group-error">{formErrors.task}</span>}
      <label className={`field-label ${formErrors.description ? "has-error" : ""}`}>Комментарий оператору<span className="optional-label">необязательно</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Например: проверить северную кромку после дождя" rows="4" maxLength="1000" />{formErrors.description && <span className="field-error">{formErrors.description}</span>}</label>
      <Button mode="primary" size="large" type="submit" disabled={submitting || !form.field_id} iconAfter={<ArrowRight size={17} />}>{submitting ? "Публикация…" : "Разместить заказ"}</Button>
    </form>}
    <section className="section-block"><div className="section-heading"><div><span className="eyebrow">ИСТОРИЯ</span><h2>История заказов</h2></div><span className="counter-badge">{visibleOrders.length} показано</span></div>
      <div className="orders-toolbar glass-card"><div className="search-field"><Search size={17} /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по полю или задаче" /></div><div className="filter-pills">{[["all","Все"],["pending","В поиске"],["in_progress","В работе"],["completed","Готово"],["cancelled","Отменён"]].map(([value,label]) => <button type="button" key={value} className={statusFilter === value ? "active" : ""} onClick={() => setStatusFilter(value)}><Filter size={12} />{label}</button>)}</div></div>
      <div className="orders-table glass-card">{loading ? <div className="loading-table">Загружаем заказы…</div> : visibleOrders.length ? visibleOrders.map((order) => <Link to={`/farmer/orders/${order.id}`} className="order-row" key={order.id}><div className="order-icon"><ClipboardList size={18} /></div><div className="order-main"><strong>{order.field_name}</strong><span>{order.task} · {Number(order.area || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} га</span>{order.description && <small>{order.description}</small>}</div><div className="order-side"><span className={`status-badge status-${order.status}`}>{order.status_label}</span><small>{new Date(order.updated_at || order.created_at).toLocaleDateString("ru-RU")}</small></div><ArrowRight size={16} /></Link>) : <div className="empty-state"><ClipboardList size={30} /><h2>{orders.length ? "Ничего не найдено" : "Заказов ещё нет"}</h2><p className="page-lead">{orders.length ? "Измените запрос или выберите другой статус." : "Первый заказ можно создать здесь за минуту."}</p></div>}</div>
    </section>
  </>;
}
