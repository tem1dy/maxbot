import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ClipboardList, FileBox, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { exchangeApi } from "../lib/exchangeApi.js";
import { formatAreaHa } from "../lib/geo.js";

export function Farmer() {
  const [orders, setOrders] = useState([]);
  const [fields, setFields] = useState([]);
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");

  async function loadWorkspace() {
    const failures = [];
    const [ordersResult, fieldsResult, resultsResult] = await Promise.allSettled([
      exchangeApi.myOrders(),
      exchangeApi.fields(),
      exchangeApi.results(),
    ]);
    if (ordersResult.status === "fulfilled") setOrders(ordersResult.value); else failures.push("заказы");
    if (fieldsResult.status === "fulfilled") setFields(fieldsResult.value); else failures.push("поля");
    if (resultsResult.status === "fulfilled") setResults(resultsResult.value); else failures.push("результаты");
    setError(failures.length ? `Не удалось загрузить: ${failures.join(", ")}.` : "");
  }

  useEffect(() => {
    loadWorkspace();
    const refresh = () => loadWorkspace();
    window.addEventListener("pole:field-created", refresh);
    window.addEventListener("pole:field-deleted", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("pole:field-created", refresh);
      window.removeEventListener("pole:field-deleted", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const activeOrders = orders.filter((order) => !["completed", "cancelled"].includes(order.status));
  const inWork = activeOrders.filter((order) => order.status === "in_progress").length;
  const completedOrders = orders.filter((order) => order.status === "completed").length;
  const latestResult = useMemo(
    () => [...results].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null,
    [results],
  );
  const activeLand = useMemo(() => activeOrders.reduce((sum, order) => sum + Number(order.area || 0), 0), [activeOrders]);
  const visibleCurrentOrders = activeOrders.slice(0, 5);


  return <>
    <section className="dashboard-hero glass-card">
      <div className="dashboard-hero-copy">
        <span className="eyebrow">ФЕРМЕР</span>
        <h1>Всё для ваших полей</h1>
        <p>Создавайте заказы, выбирайте исполнителя и получайте результат облёта в одном месте.</p>
        <div className="hero-inline-actions">
          <Link className="primary-button-link" to="/farmer/orders"><Plus size={17} /> Новый заказ</Link>
          <Link className="hero-text-link" to="/farmer/fields">Мои поля <ArrowRight size={15} /></Link>
        </div>
      </div>
      <div className="dashboard-hero-stats">
        <div><span>Поля</span><strong>{fields.length}</strong><small>{fields.length ? "сохранены" : "добавьте первое"}</small></div>
        <div><span>Заказы</span><strong>{activeOrders.length}</strong><small>{inWork ? `${inWork} в работе` : "ожидают исполнителя"}</small></div>
        <div><span>Результаты</span><strong>{results.length}</strong><small>{results.length ? "готовы к просмотру" : "пока нет"}</small></div>
      </div>
    </section>

    {error && <div className="form-error page-alert" role="alert">{error}<button type="button" className="alert-retry" onClick={loadWorkspace}>Повторить</button></div>}

    <section className="section-block">
      <div className="section-heading">
        <div><span className="eyebrow">В РАБОТЕ</span><h2>Текущие заказы</h2></div>
        <Link className="section-action" to="/farmer/orders">Все заказы <ArrowRight size={15} /></Link>
      </div>
      <div className="current-orders-card glass-card">
        <div className="current-orders-summary">
          <div><span>Активных заказов</span><strong>{activeOrders.length}</strong></div>
          <div><span>Общая площадь</span><strong>{activeLand.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} га</strong></div>
          <div><span>В работе</span><strong>{inWork}</strong></div>
          <div><span>Завершено за всё время</span><strong>{completedOrders}</strong></div>
        </div>
        {visibleCurrentOrders.length ? <div className="current-orders-list">
          {visibleCurrentOrders.map((order) => <Link className="current-order-row" to={`/farmer/orders/${order.id}`} key={order.id}>
            <div className="current-order-icon"><ClipboardList size={18} /></div>
            <div><strong>{order.field_name}</strong><span>{order.task} · {formatAreaHa(order.area)}</span></div>
            <span className={`status-badge status-${order.status}`}>{order.status_label}</span>
            <ArrowRight size={15} />
          </Link>)}
          {activeOrders.length > visibleCurrentOrders.length && <Link className="current-orders-more" to="/farmer/orders">Показать ещё {activeOrders.length - visibleCurrentOrders.length} заказа <ArrowRight size={14} /></Link>}
        </div> : <div className="current-orders-empty"><ClipboardList size={26} /><div><strong>Активных заказов нет</strong><p>Создайте заказ по сохранённому полю, чтобы начать работу с оператором.</p></div><Link to="/farmer/orders" className="primary-link">Создать заказ</Link></div>}
      </div>
    </section>

    {latestResult && <section className="section-block">
      <div className="section-heading"><div><span className="eyebrow">ИСТОРИЯ</span><h2>Последний результат</h2></div><Link className="section-action" to="/farmer/results">Все результаты <ArrowRight size={15} /></Link></div>
      <Link to={`/farmer/results/${latestResult.id}`} className="latest-result-card glass-card">
        <div className="latest-result-icon"><FileBox size={21} /></div>
        <div><strong>{latestResult.field_name}</strong><span>{latestResult.task} · {formatAreaHa(latestResult.area)} · {latestResult.files?.length || 0} материалов</span><small>{new Date(latestResult.created_at).toLocaleDateString("ru-RU")}</small></div>
        <span className="status-badge status-completed">Готово</span><ArrowRight size={17} />
      </Link>
    </section>}
  </>;
}
