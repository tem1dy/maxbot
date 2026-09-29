import { NavLink } from "react-router-dom";
import { ClipboardList, FileBox, LayoutDashboard, Map, UserRound, Radar } from "lucide-react";

const farmerItems = [
  ["/farmer", "Обзор", LayoutDashboard],
  ["/farmer/orders", "Заказы", ClipboardList],
  ["/farmer/fields", "Поля", Map],
  ["/farmer/results", "Результаты", FileBox],
  ["/farmer/profile", "Профиль", UserRound],
];

const operatorItems = [
  ["/operator", "Биржа", Radar],
  ["/operator/tasks", "Задания", ClipboardList],
  ["/operator/profile", "Профиль", UserRound],
];

export function DashboardNav({ role }) {
  const items = role === "farmer" ? farmerItems : operatorItems;
  return (
    <nav className={`dashboard-nav dashboard-nav-${role}`} aria-label="Основная навигация">
      {items.map(([to, label, Icon]) => (
        <NavLink key={to} to={to} end={to === `/${role}`} className={({ isActive }) => isActive ? "active" : ""}>
          <Icon size={17} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
