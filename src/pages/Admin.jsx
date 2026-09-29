import { useEffect, useMemo, useState } from "react";
import { ClipboardList, FileBox, LogOut, Map, Search, ShieldCheck, Trash2, UserRound, Users, XCircle, CheckCircle2, PlayCircle, Clock3 } from "lucide-react";
import { exchangeApi } from "../lib/exchangeApi.js";
import { ConfirmDialog, Input } from "../components/ui/Controls.jsx";

const STATUS = {
  pending: { label: "В поиске", icon: Clock3, tone: "pending" },
  in_progress: { label: "В работе", icon: PlayCircle, tone: "in_progress" },
  completed: { label: "Готово", icon: CheckCircle2, tone: "completed" },
  cancelled: { label: "Отменён", icon: XCircle, tone: "cancelled" },
};

function StatusBadge({ status }) {
  const meta = STATUS[status] || { label: status, icon: Clock3, tone: "pending" };
  const Icon = meta.icon;
  return <span className={`admin-status-badge status-${meta.tone}`}>{meta.tone === "completed" ? null : <Icon size={13} />}{meta.label}</span>;
}

export function Admin() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [section, setSection] = useState("orders");

  async function refresh(currentToken = token) {
    if (!currentToken) return;
    setError("");
    try { setData(await exchangeApi.adminDashboard(currentToken)); }
    catch (err) { setError(err.message || "Не удалось обновить панель."); }
  }

  useEffect(() => {
    const queryToken = new URLSearchParams(window.location.search).get("token");
    const startParam = window.WebApp?.initDataUnsafe?.start_param || window.Max?.WebApp?.initDataUnsafe?.start_param || "";
    const startToken = startParam.startsWith("admin_") ? startParam.slice(6) : "";
    let savedToken = "";
    try { savedToken = sessionStorage.getItem("pole-admin-token") || ""; } catch {}
    const resolved = queryToken || startToken || savedToken;
    if (!resolved) { setLoading(false); return; }
    setToken(resolved);
    exchangeApi.adminDashboard(resolved).then(setData).catch((err) => { try { sessionStorage.removeItem("pole-admin-token"); } catch {} setToken(""); setError(err.message || "Административная сессия недействительна."); }).finally(() => setLoading(false));
  }, []);

  async function login(event) {
    event.preventDefault();
    setError("");
    try {
      const currentUser = window.WebApp?.initDataUnsafe?.user || window.Max?.WebApp?.initDataUnsafe?.user;
      const userId = currentUser?.id || currentUser?.user_id || "0";
      const result = await exchangeApi.adminLogin(String(userId), password);
      try { sessionStorage.setItem("pole-admin-token", result.token); } catch {}
      window.history.replaceState({}, "", "/admin");
      setToken(result.token);
      setPassword("");
      await refresh(result.token);
    } catch (err) { setError(err.message || "Не удалось войти."); }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(deleteTarget.id);
    setDeleteError("");
    try {
      if (deleteTarget.type === "order") await exchangeApi.adminDeleteOrder(token, deleteTarget.id);
      if (deleteTarget.type === "field") await exchangeApi.adminDeleteField(token, deleteTarget.id);
      if (deleteTarget.type === "result") await exchangeApi.adminDeleteResult(token, deleteTarget.id);
      if (deleteTarget.type === "user") await exchangeApi.adminDeleteUser(token, deleteTarget.id);
      setDeleteTarget(null);
      await refresh();
    } catch (err) { setDeleteError(err.message || "Не удалось удалить объект."); }
    finally { setDeleting(""); }
  }

  const visibleOrders = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.orders.filter((order) => !q || `${order.field_name} ${order.task} ${order.farmer_name} ${order.operator_name || ""}`.toLowerCase().includes(q));
  }, [data, query]);
  const visibleFields = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.fields.filter((field) => !q || `${field.field_number} ${field.name} ${field.crop} ${field.region}`.toLowerCase().includes(q));
  }, [data, query]);
  const visibleResults = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.results.filter((result) => !q || `${result.field_name} ${result.task}`.toLowerCase().includes(q));
  }, [data, query]);
  const visibleUsers = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.users.filter((user) => !q || `${user.name} ${user.username || ""} ${user.role}`.toLowerCase().includes(q));
  }, [data, query]);

  if (loading) return <main className="admin-page"><div className="loading-state">Загружаем панель…</div></main>;
  if (!token || !data) return <main className="admin-page"><section className="admin-login glass-card"><div className="admin-login-mark"><ShieldCheck size={27} /></div><span className="eyebrow">СЛУЖЕБНЫЙ ДОСТУП</span><h1>Панель администратора</h1><p>Введите пароль администратора, чтобы открыть управление сервисом.</p><form onSubmit={login}><label className="field-label">Пароль<Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label><button className="ui-button ui-button-primary ui-button-large" type="submit">Открыть панель</button></form>{error && <div className="form-error">{error}</div>}</section></main>;

  const tabs = [
    ["orders", "Заказы", ClipboardList, data.orders.length],
    ["fields", "Поля", Map, data.fields.length],
    ["results", "Результаты", FileBox, data.results.length],
    ["users", "Пользователи", Users, data.users.length],
  ];
  return <main className="admin-page">
    <header className="admin-head"><div><span className="eyebrow">СЛУЖЕБНЫЙ РАЗДЕЛ</span><h1>Панель управления</h1><p>Пользователи, поля, заказы и результаты в одном месте.</p></div><button className="ui-button ui-button-secondary" type="button" onClick={() => { try { sessionStorage.removeItem("pole-admin-token"); } catch {} setToken(""); setData(null); setPassword(""); }}><LogOut size={15} />Выйти</button></header>
    {error && <div className="form-error page-alert" role="alert">{error}<button type="button" className="alert-retry" onClick={() => refresh()}>Повторить</button></div>}
    <section className="admin-stats"><div className="glass-card"><Users size={18}/><strong>{data.stats.users}</strong><span>пользователей</span></div><div className="glass-card"><ClipboardList size={18}/><strong>{data.stats.orders}</strong><span>заказов</span></div><div className="glass-card"><Map size={18}/><strong>{data.stats.fields}</strong><span>полей</span></div><div className="glass-card"><PlayCircle size={18}/><strong>{data.stats.in_progress}</strong><span>в работе</span></div><div className="glass-card"><CheckCircle2 size={18}/><strong>{data.stats.completed}</strong><span>завершено</span></div></section>
    <section className="admin-card glass-card admin-management">
      <div className="admin-tabs">{tabs.map(([id, label, Icon, count]) => <button type="button" key={id} className={section === id ? "active" : ""} onClick={() => { setSection(id); setQuery(""); }}><Icon size={15}/><span>{label}</span><b>{count}</b></button>)}</div>
      <div className="search-field admin-search"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={section === "users" ? "Поиск по пользователю" : section === "fields" ? "Поиск по полю или культуре" : section === "results" ? "Поиск по результату" : "Поиск по заказу или пользователю"}/></div>
      {section === "orders" && <div className="admin-table admin-scroll">{visibleOrders.length ? visibleOrders.map((order) => <div className="admin-row admin-order-row" key={order.id}><div className="admin-row-main"><strong>{order.field_name}</strong><span>{order.task} · {Number(order.area || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} га</span><small>{order.farmer_name}{order.farmer_username ? ` · @${order.farmer_username}` : ""}</small></div><div className="admin-row-person"><span>{order.operator_name || "Оператор не назначен"}</span><small>{order.operator_username ? `@${order.operator_username}` : ""}</small></div><div className="admin-row-actions"><div className="admin-row-status" aria-label={`Статус: ${STATUS[order.status]?.label || order.status}`}><StatusBadge status={order.status}/></div><button className="admin-delete-button" type="button" aria-label="Удалить заказ" onClick={() => { setDeleteError(""); setDeleteTarget({ type:"order", id:order.id, title:order.field_name, subtitle:"Заказ и связанные результаты и отклики" }); }}><Trash2 size={15}/></button></div></div>) : <div className="admin-empty">Заказы не найдены.</div>}</div>}
      {section === "fields" && <div className="admin-table admin-scroll">{visibleFields.length ? visibleFields.map((field) => <div className="admin-row admin-row-field" key={field.id}><div className="admin-row-main"><strong>Поле №{field.field_number || "—"}{field.name ? ` · ${field.name}` : ""}</strong><span>{field.crop} · {Number(field.area || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} га</span><small>{field.farmer_name}{field.farmer_username ? ` · @${field.farmer_username}` : ""}</small></div><div className="admin-row-actions"><button className="admin-delete-button" type="button" aria-label="Удалить поле" onClick={() => { setDeleteError(""); setDeleteTarget({ type:"field", id:field.id, title:`Поле №${field.field_number || "—"}`, subtitle:"После удаления поле исчезнет из реестра, а история связанных заказов сохранит свои данные." }); }}><Trash2 size={15}/></button></div></div>) : <div className="admin-empty">Поля не найдены.</div>}</div>}
      {section === "results" && <div className="admin-table admin-scroll">{visibleResults.length ? visibleResults.map((result) => <div className="admin-row admin-row-field" key={result.id}><div className="admin-row-main"><strong>{result.field_name}</strong><span>{result.task} · {Number(result.area || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} га</span><small>{result.farmer_name}{result.farmer_username ? ` · @${result.farmer_username}` : ""} · {new Date(result.created_at).toLocaleDateString("ru-RU")}</small></div><div className="admin-row-actions"><button className="admin-delete-button" type="button" aria-label="Удалить результат" onClick={() => { setDeleteError(""); setDeleteTarget({ type:"result", id:result.id, title:`Результат: ${result.field_name}`, subtitle:"Файлы результата также будут удалены" }); }}><Trash2 size={15}/></button></div></div>) : <div className="admin-empty">Результаты не найдены.</div>}</div>}
      {section === "users" && <div className="admin-table admin-scroll">{visibleUsers.length ? visibleUsers.map((user) => <div className="admin-row admin-row-user" key={user.id}><div className="admin-user-avatar"><UserRound size={17}/></div><div className="admin-row-main"><strong>{user.name}</strong><span>{user.role === "farmer" ? "Фермер" : "Оператор"}{user.username ? ` · @${user.username}` : ""}</span><small>{new Date(user.created_at).toLocaleDateString("ru-RU")}</small></div><div className="admin-row-actions"><button className="admin-delete-button" type="button" aria-label="Удалить пользователя" onClick={() => { setDeleteError(""); setDeleteTarget({ type:"user", id:user.id, title:user.name, subtitle:"Будут удалены связанные данные пользователя" }); }}><Trash2 size={15}/></button></div></div>) : <div className="admin-empty">Пользователи не найдены.</div>}</div>}
    </section>
    <ConfirmDialog open={Boolean(deleteTarget)} title="Удалить объект?" description={deleteTarget ? `${deleteTarget.title}. ${deleteTarget.subtitle}. Это действие нельзя отменить.` : ""} confirmLabel="Удалить" icon={<Trash2 size={21}/>} busy={Boolean(deleting)} onCancel={() => !deleting && setDeleteTarget(null)} onConfirm={confirmDelete}>{deleteError && <div className="confirm-dialog-error" role="alert">{deleteError}</div>}</ConfirmDialog>
  </main>;
}
