import { useEffect, useState } from "react";
import { ArrowRight, Moon, ScanLine, Sprout, Sun } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useTheme } from "../contexts/ThemeContext.jsx";

export function Auth() {
  const { chooseRole, user, role, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && role) navigate(`/${role}`, { replace: true });
  }, [loading, role, navigate]);

  async function selectRole(nextRole) {
    setPending(nextRole);
    setError("");
    try {
      await chooseRole(nextRole);
      navigate(`/${nextRole}`);
    } catch (err) {
      setError(err?.message || "Не удалось создать профиль. Попробуйте ещё раз.");
    } finally {
      setPending("");
    }
  }

  return (
    <main className="auth-page">
      <header className="auth-header">
        <div className="auth-brand">
          <span className="auth-brand-switch" aria-hidden="true">
            <img className="brand-mark" src="/pole-ryadom-mark.png" alt="" />
          </span>
          <div>
            <strong>Поле рядом</strong>
            <span>Биржа услуг агродронов</span>
          </div>
        </div>
        <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label="Переключить тему">
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </header>

      <section className="auth-shell">
        <div className="auth-intro">
          <span className="eyebrow">Начало работы</span>
          <h1>Кто вы?</h1>
          <p>Выберите роль, и «Поле рядом» настроит рабочее пространство под ваши задачи.</p>
          {user && <div className="auth-user-note">Вы вошли в MAX как <strong>{user.name || user.first_name}</strong></div>}
        </div>

        <div className="auth-role-label">Роль в сервисе</div>
        <div className="auth-roles">
          <button type="button" className={`role-card ${pending === "farmer" ? "is-pending" : ""}`} disabled={Boolean(pending)} onClick={() => selectRole("farmer")}>
            <span className="role-icon"><Sprout size={22} /></span>
            <span><strong>Фермер</strong><small>Сохранять поля, размещать заказы и получать результаты</small></span>
            <ArrowRight size={18} />
          </button>
          <button type="button" className={`role-card ${pending === "operator" ? "is-pending" : ""}`} disabled={Boolean(pending)} onClick={() => selectRole("operator")}>
            <span className="role-icon"><ScanLine size={22} /></span>
            <span><strong>Оператор агродрона</strong><small>Находить заказы, отправлять предложения и сдавать результат</small></span>
            <ArrowRight size={18} />
          </button>
        </div>
        {pending && <div className="auth-pending">Подключаем рабочее пространство…</div>}
        {error && <div className="form-error auth-error" role="alert">{error}</div>}
      </section>
    </main>
  );
}
