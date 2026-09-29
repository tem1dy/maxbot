import { Bell, ExternalLink, LogOut, Moon, Sun } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext.jsx";
import { Link, useNavigate } from "react-router-dom";
import { openMaxLink } from "../../lib/maxBridge.js";

export function DashboardHeader({ role, userName, notifications = [], onNotification, onLogout }) {
  const unread = notifications.filter((item) => !item.read).length;
  const { theme, toggleTheme } = useTheme();
  const roleLabel = role === "farmer" ? "Фермер" : "Оператор";

  return (
    <header className="app-header">
      <Link to={role === "farmer" ? "/farmer" : "/operator"} className="brand-lockup brand-home-link" aria-label="Поле рядом: на главную">
        <span className="brand-icon-switch" aria-hidden="true">
          <img className="brand-icon-image" src="/pole-ryadom-mark.png" alt="" />
        </span>
        <div className="brand-copy"><strong>Поле рядом</strong><span>Биржа услуг агродронов</span></div>
        <span className="role-headline">{roleLabel}</span>
      </Link>
      <div className="header-actions">
        <button className="icon-button" onClick={toggleTheme} aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"} title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
        <button className="icon-button notification-button" aria-label="Уведомления" onClick={onNotification}><Bell size={18} />{unread > 0 && <span>{unread > 9 ? "9+" : unread}</span>}</button>
        <button className="icon-button" onClick={onLogout} aria-label="Выйти" title="Выйти"><LogOut size={18} /></button>
      </div>
    </header>
  );
}

function actionLabel(item) {
  if (!item.action_path) return "Открыть";
  if (String(item.action_path).includes("results")) return "Открыть результат";
  if (String(item.action_path).includes("operator")) return "Открыть задание";
  return "Открыть заказ";
}

export function NotificationPopover({ notifications, onRead, onClose, onMarkAll }) {
  const navigate = useNavigate();
  const unread = notifications.filter((item) => !item.read).length;

  function openNotification(item) {
    onRead(item);
    onClose();
    if (item.action_path) navigate(item.action_path);
  }

  return (
    <div className="notification-panel" role="dialog" aria-label="Уведомления">
      <div className="notification-panel-head">
        <div><strong>Уведомления</strong><span>{unread ? `${unread} непрочитано` : notifications.length ? "Все прочитаны" : "Пока пусто"}</span></div>
        <div className="notification-head-actions">
          {unread > 0 && <button type="button" className="notification-read-all" onClick={onMarkAll}>Прочитать все</button>}
          <button type="button" className="notification-close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>
      </div>
      {notifications.length ? notifications.slice(0, 10).map((item) => (
        <article className={`notification-item ${item.read ? "is-read" : ""}`} key={item.id}>
          <button type="button" className="notification-main" onClick={() => openNotification(item)}>
            <span className={`notification-item-dot ${item.read ? "read" : ""}`} aria-hidden="true" />
            <div><strong>{item.title}</strong><span>{item.message}</span><small>{new Date(item.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</small></div>

          </button>
          <div className="notification-actions">
            {item.action_path && <button type="button" className="notification-action" onClick={() => openNotification(item)}><ExternalLink size={14} /> {actionLabel(item)}</button>}
            {item.contact_username && <button type="button" className="notification-action" onClick={() => openMaxLink(`https://max.ru/${String(item.contact_username).replace(/^@/, "")}`)}>@{String(item.contact_username).replace(/^@/, "")} · Написать</button>}
          </div>
        </article>
      )) : <div className="notification-empty">Здесь появятся отклики, назначения и готовые результаты.</div>}
    </div>
  );
}
