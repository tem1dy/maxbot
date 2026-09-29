import { createContext, useContext, useEffect, useMemo, useState } from "react";

const AuthContext = createContext(null);

function getMaxWebApp() {
  return window.WebApp || window.Max?.WebApp || null;
}

function getMaxUser() {
  return getMaxWebApp()?.initDataUnsafe?.user || null;
}

function normalizeUser(payload) {
  if (!payload) return null;
  const parts = String(payload.name || "Пользователь MAX").trim().split(/\s+/);
  return {
    user_id: String(payload.user_id),
    first_name: parts[0] || "Пользователь",
    last_name: parts.slice(1).join(" "),
    name: payload.name,
    username: payload.username || "",
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const maxUser = getMaxUser();
    return maxUser
      ? {
          user_id: String(maxUser.id),
          first_name: maxUser.first_name || "Пользователь",
          last_name: maxUser.last_name || "",
          name: [maxUser.first_name, maxUser.last_name].filter(Boolean).join(" "),
          username: maxUser.username || "",
        }
      : null;
  });
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMaxWebApp()?.ready?.();
    const maxUser = getMaxUser();
    if (maxUser) {
      setUser((current) => current || {
        user_id: String(maxUser.id),
        first_name: maxUser.first_name || "Пользователь",
        last_name: maxUser.last_name || "",
        name: [maxUser.first_name, maxUser.last_name].filter(Boolean).join(" "),
        username: maxUser.username || "",
      });
    }

    fetch("/api/me", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((session) => {
        if (session) {
          setUser(normalizeUser(session));
          setRole(session.role);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(() => ({
    user,
    role,
    loading,
    authenticated: Boolean(user && role),
    async chooseRole(next) {
      const maxUser = getMaxUser();
      const userId = String(maxUser?.id || (user?.user_id && !String(user.user_id).startsWith("preview-" ) ? user.user_id : `preview-${next}`));
      const response = await fetch("/api/auth", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          role: next,
          name: [maxUser?.first_name, maxUser?.last_name].filter(Boolean).join(" ") || user?.name || "Пользователь MAX",
          username: maxUser?.username || user?.username || "",
          init_data: getMaxWebApp()?.initData || "",
        }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Не удалось авторизоваться");
      }
      const session = await response.json();
      setUser(normalizeUser(session));
      setRole(session.role);
      return session;
    },
    async logout() {
      try {
        await fetch("/api/logout", { method: "POST", credentials: "include" });
      } finally {
        setRole(null);
      }
    },
  }), [loading, role, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
