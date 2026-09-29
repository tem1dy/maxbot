import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import { exchangeApi } from "../lib/exchangeApi.js";
import { DashboardHeader, NotificationPopover } from "../components/layout/DashboardHeader.jsx";
import { DashboardNav } from "../components/layout/DashboardNav.jsx";

function WelcomeToast({ userName }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem("pole-ryadom-welcome") === "1"; } catch {}
    if (seen) return undefined;
    setVisible(true);
    try { sessionStorage.setItem("pole-ryadom-welcome", "1"); } catch {}
    const timer = setTimeout(() => setVisible(false), 2600);
    return () => clearTimeout(timer);
  }, []);
  return visible ? <div className="welcome-toast" role="status"><strong>С возвращением, {userName || "в сервис"}</strong><span>Рабочее пространство готово.</span></div> : null;
}

export function OperatorLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { let active = true; const load = async () => { try { const next = await exchangeApi.notifications(); if (active) setNotifications(next); } catch {} }; load(); const timer = setInterval(load, 30000); return () => { active = false; clearInterval(timer); }; }, []);
  async function readNotification(item) { if (item.read) return; try { await exchangeApi.readNotification(item.id); setNotifications((items) => items.map((current) => current.id === item.id ? { ...current, read: 1 } : current)); } catch {} }
  async function readAll() { try { await exchangeApi.readAllNotifications(); setNotifications((items) => items.map((item) => ({ ...item, read: 1 }))); } catch {} }
  return <main className="app-page app-page-with-nav">
    <DashboardHeader role="operator" userName={user?.name || user?.first_name} notifications={notifications} onNotification={() => setOpen((value) => !value)} onLogout={async () => { await logout(); navigate("/auth", { replace: true }); }} />
    {open && createPortal(<div className="notification-wrap"><button type="button" className="notification-scrim" onClick={() => setOpen(false)} aria-label="Закрыть уведомления" /><NotificationPopover notifications={notifications} onRead={readNotification} onClose={() => setOpen(false)} onMarkAll={readAll} /></div>, document.body)}
    <WelcomeToast userName={user?.first_name || user?.name} />
    <Outlet />
    <DashboardNav role="operator" />
  </main>;
}
