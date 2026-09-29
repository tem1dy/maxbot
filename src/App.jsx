import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import React, { useEffect } from "react";
import { Auth } from "./pages/Auth.jsx";
import { FarmerLayout } from "./pages/FarmerLayout.jsx";
import { Farmer } from "./pages/Farmer.jsx";
import { FarmerOrders } from "./pages/farmer/FarmerOrders.jsx";
import { FarmerOrderDetail } from "./pages/farmer/FarmerOrderDetail.jsx";
import { FarmerFields } from "./pages/farmer/FarmerFields.jsx";
import { FarmerResults } from "./pages/farmer/FarmerResults.jsx";
import { FarmerResultDetail } from "./pages/farmer/FarmerResultDetail.jsx";
import { FarmerProfile } from "./pages/farmer/FarmerProfile.jsx";
import { OperatorLayout } from "./pages/OperatorLayout.jsx";
import { Operator } from "./pages/Operator.jsx";
import { OperatorOrderDetail } from "./pages/operator/OperatorOrderDetail.jsx";
import { OperatorTasks } from "./pages/operator/OperatorTasks.jsx";
import { OperatorProfile } from "./pages/operator/OperatorProfile.jsx";
import { useAuth } from "./contexts/AuthContext.jsx";
import { Admin } from "./pages/Admin.jsx";

class AppErrorBoundary extends React.Component {
  state = { error: null, resetKey: this.props.resetKey };
  static getDerivedStateFromProps(nextProps, prevState) {
    if (nextProps.resetKey !== prevState.resetKey) return { error: null, resetKey: nextProps.resetKey };
    return null;
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error("AgroMax UI error", error); }
  render() {
    if (!this.state.error) return this.props.children;
    return <main className="app-page"><section className="glass-card app-route-error"><span className="eyebrow">ОШИБКА ЭКРАНА</span><h1>Не удалось открыть страницу</h1><p>Произошла ошибка при отображении данных. Вернитесь назад и попробуйте снова.</p><div className="app-route-error-actions"><button className="ui-button ui-button-secondary" type="button" onClick={() => window.history.back()}>Назад</button><button className="ui-button ui-button-primary" type="button" onClick={() => window.location.reload()}>Обновить</button></div></section></main>;
  }
}

function ErrorBoundaryRouteShell({ children }) {
  const location = useLocation();
  return <AppErrorBoundary resetKey={`${location.pathname}${location.search}`}>{children}</AppErrorBoundary>;
}

function getStartPayload() {
  const bridgeParam = window.WebApp?.initDataUnsafe?.start_param || window.Max?.WebApp?.initDataUnsafe?.start_param || "";
  if (bridgeParam) return String(bridgeParam);
  try {
    const params = new URLSearchParams(window.location.search);
    const direct = params.get("startapp") || params.get("start_param");
    if (direct) return direct;
    const hash = String(window.location.hash || "").replace(/^#/, "");
    const hashParams = new URLSearchParams(hash.startsWith("?") ? hash.slice(1) : hash);
    const hashed = hashParams.get("startapp") || hashParams.get("start_param");
    if (hashed) return hashed;
  } catch {}
  return "";
}

function DeepLinkRedirect() {
  const { role, authenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading || window.__agromaxDeepLinkHandled) return;
    const payload = getStartPayload();
    if (!payload) return;
    if (payload.startsWith("admin_")) {
      const token = payload.slice(6);
      if (!token) return;
      window.__agromaxDeepLinkHandled = true;
      navigate(`/admin?token=${encodeURIComponent(token)}`, { replace: true });
      return;
    }
    if (!authenticated || !role) return;
    window.__agromaxDeepLinkHandled = true;
    if (payload.startsWith("order_")) {
      const id = payload.slice(6);
      if (id && location.pathname !== `/${role}/orders/${id}`) navigate(`/${role}/orders/${id}`, { replace: true });
    } else if (payload.startsWith("result_")) {
      const id = payload.slice(7);
      if (role === "farmer" && id && location.pathname !== `/farmer/results/${id}`) navigate(`/farmer/results/${id}`, { replace: true });
    } else if (payload === "new_order" && role === "farmer") {
      navigate("/farmer/orders", { replace: true });
    }
  }, [authenticated, loading, role, navigate, location.pathname]);

  return null;
}

function Protected({ children, role }) {
  const { authenticated, role: currentRole, loading } = useAuth();
  if (loading) return <div className="app-loading">Проверяем сессию…</div>;
  if (!authenticated) return <Navigate to="/auth" replace />;
  if (role && currentRole !== role) return <Navigate to={`/${currentRole}`} replace />;
  return children;
}

export default function App() {
  const { role } = useAuth();
  return <ErrorBoundaryRouteShell><DeepLinkRedirect /><Routes>
    <Route path="/auth" element={<Auth />} />
    <Route path="/admin" element={<Admin />} />
    <Route path="/farmer" element={<Protected role="farmer"><FarmerLayout /></Protected>}>
      <Route index element={<Farmer />} />
      <Route path="orders" element={<FarmerOrders />} />
      <Route path="orders/:id" element={<FarmerOrderDetail />} />
      <Route path="fields" element={<FarmerFields />} />
      <Route path="results" element={<FarmerResults />} />
      <Route path="results/:id" element={<FarmerResultDetail />} />
      <Route path="profile" element={<FarmerProfile />} />
    </Route>
    <Route path="/operator" element={<Protected role="operator"><OperatorLayout /></Protected>}>
      <Route index element={<Operator />} />
      <Route path="orders/:id" element={<OperatorOrderDetail />} />
      <Route path="tasks" element={<OperatorTasks />} />
      <Route path="profile" element={<OperatorProfile />} />
    </Route>
    <Route path="*" element={<Navigate to={role ? `/${role}` : "/auth"} replace />} />
  </Routes></ErrorBoundaryRouteShell>;
}
