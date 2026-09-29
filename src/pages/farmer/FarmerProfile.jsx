import { useEffect, useState } from "react";
import { LogOut, Map, ClipboardList, FileBox, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { exchangeApi } from "../../lib/exchangeApi.js";
import { Button } from "../../components/ui/Controls.jsx";

export function FarmerProfile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState("");

  async function loadStats() {
    setStatsError("");
    try {
      const [fields, orders, results] = await Promise.all([
        exchangeApi.fields(),
        exchangeApi.myOrders(),
        exchangeApi.results(),
      ]);
      setStats({ fields: fields.length, orders: orders.length, results: results.length });
    } catch (loadError) {
      setStats(null);
      setStatsError(loadError.message || "Не удалось загрузить статистику профиля.");
    }
  }

  useEffect(() => {
    loadStats();
    const refresh = () => loadStats();
    window.addEventListener("focus", refresh);
    window.addEventListener("pole:field-created", refresh);
    window.addEventListener("pole:field-deleted", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pole:field-created", refresh);
      window.removeEventListener("pole:field-deleted", refresh);
    };
  }, []);

  async function exit() { await logout(); navigate("/auth", { replace: true }); }

  return <>
    <section className="page-title-row"><div><span className="eyebrow">ФЕРМЕР · ПРОФИЛЬ</span><h1>Профиль</h1><p className="page-lead">Ваш аккаунт, поля и история работы с заказами.</p></div></section>
    <section className="glass-card profile-card profile-account"><div className="profile-avatar"><UserRound size={28} /></div><div><span className="eyebrow">АККАУНТ</span><strong>{user?.name || user?.first_name || "Пользователь MAX"}</strong><span className="profile-role">Фермер{user?.username ? ` · @${user.username}` : ""}</span></div></section>
    {!stats ? <div className="profile-stats-loading glass-card">{statsError || "Загружаем статистику…"}</div> : <section className="profile-stats"><div className="glass-card"><Map size={18} /><strong>{stats.fields}</strong><span>полей</span><Link to="/farmer/fields">Открыть</Link></div><div className="glass-card"><ClipboardList size={18} /><strong>{stats.orders}</strong><span>заказов</span><Link to="/farmer/orders">Открыть</Link></div><div className="glass-card"><FileBox size={18} /><strong>{stats.results}</strong><span>результатов</span><Link to="/farmer/results">Открыть</Link></div></section>}
    <Button className="logout-button" mode="secondary" size="large" onClick={exit} iconBefore={<LogOut size={17} />}>Выйти из профиля</Button>
  </>;
}
