import { useEffect, useState } from "react";
import { ClipboardList, LogOut, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { exchangeApi } from "../../lib/exchangeApi.js";
import { Button } from "../../components/ui/Controls.jsx";

export function OperatorProfile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState("");

  async function loadStats() {
    setStatsError("");
    try {
      const [active, open, history] = await Promise.all([
        exchangeApi.operatorOrders(),
        exchangeApi.orders(),
        exchangeApi.operatorHistory(),
      ]);
      setStats({ active: active.length, total: open.length, completed: history.filter((item) => item.status === "completed").length });
    } catch (loadError) {
      setStats(null);
      setStatsError(loadError.message || "Не удалось загрузить статистику профиля.");
    }
  }

  useEffect(() => {
    loadStats();
    const refresh = () => loadStats();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  async function exit() { await logout(); navigate("/auth", { replace: true }); }

  return <>
    <section className="page-title-row"><div><span className="eyebrow">ОПЕРАТОР · ПРОФИЛЬ</span><h1>Профиль</h1><p className="page-lead">Ваш аккаунт и рабочая статистика в «Поле рядом».</p></div></section>
    <section className="glass-card profile-card profile-account"><div className="profile-avatar"><UserRound size={28} /></div><div><span className="eyebrow">АККАУНТ</span><strong>{user?.name || user?.first_name || "Пользователь MAX"}</strong><span className="profile-role">Оператор агродрона{user?.username ? ` · @${user.username}` : ""}</span></div></section>
    {!stats ? <div className="profile-stats-loading glass-card">{statsError || "Загружаем статистику…"}</div> : <section className="profile-stats"><div className="glass-card"><ClipboardList size={18} /><strong>{stats.active}</strong><span>активных заданий</span><Link to="/operator/tasks">Открыть</Link></div><div className="glass-card"><ClipboardList size={18} /><strong>{stats.total}</strong><span>открытых заказов</span><Link to="/operator">Биржа</Link></div><div className="glass-card"><ClipboardList size={18} /><strong>{stats.completed}</strong><span>завершено</span><span className="profile-stat-note">выполненных вами</span></div></section>}
    <Button className="logout-button" mode="secondary" size="large" onClick={exit} iconBefore={<LogOut size={17} />}>Выйти из профиля</Button>
  </>;
}
