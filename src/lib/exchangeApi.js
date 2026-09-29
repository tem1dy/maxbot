const API = import.meta.env.VITE_API_BASE_URL || "/api";

async function request(path, options = {}) {
  const headers = options.body instanceof FormData
    ? { ...(options.headers || {}) }
    : { "Content-Type": "application/json", ...(options.headers || {}) };
  const response = await fetch(`${API}${path}`, {
    credentials: "include",
    ...options,
    headers,
  });
  if (!response.ok) {
    const body = await response.text();
    if (response.status === 413) throw new Error("Файл слишком большой. Максимальный размер: 25 МБ.");
    let message = body || `Не удалось выполнить запрос (HTTP ${response.status})`;
    try {
      const parsed = JSON.parse(body);
      message = parsed.detail || parsed.message || message;
    } catch {
      if (/^\s*<(!doctype|html|head|body)/i.test(body)) message = `Сервер не смог обработать запрос (HTTP ${response.status}).`;
    }
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json();
}

export const exchangeApi = {
  notifications: () => request("/notifications"),
  orders: () => request("/orders"),
  order: (id) => request(`/orders/${id}`),
  myOrders: () => request("/orders/my"),
  operatorOrders: () => request("/orders/operator"),
  operatorHistory: () => request("/orders/operator/history"),
  fields: () => request("/fields"),
  createField: (body) => request("/fields", { method: "POST", body: JSON.stringify(body) }),
  deleteField: (id) => request(`/fields/${id}`, { method: "DELETE" }),
  results: () => request("/results"),
  deleteResult: (id) => request(`/results/${encodeURIComponent(id)}`, { method: "DELETE" }),
  offers: (orderId) => request(`/orders/${orderId}/offers`),
  createOffer: (orderId, body) => request(`/orders/${orderId}/offers`, { method: "POST", body: JSON.stringify(body) }),
  cancelOffer: (orderId, offerId) => request(`/orders/${orderId}/offers/${encodeURIComponent(offerId)}`, { method: "DELETE" }),
  uploadFile: (orderId, file) => {
    const form = new FormData();
    form.append("file", file);
    return request(`/orders/${orderId}/files`, { method: "POST", body: form });
  },
  createOrder: (body) => request("/orders", { method: "POST", body: JSON.stringify(body) }),
  takeOrder: (id) => request(`/orders/${id}/take`, { method: "PUT", body: JSON.stringify({}) }),
  acceptOffer: (orderId, offerId) => request(`/orders/${orderId}/offers/${offerId}/accept`, { method: "POST" }),
  completeOrder: (id, body) => request(`/orders/${id}/complete`, { method: "PUT", body: JSON.stringify(body) }),
  cancelOrder: (id, reason = "") => request(`/orders/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),
  readNotification: (id) => request(`/notifications/${id}/read`, { method: "POST" }),
  readAllNotifications: () => request("/notifications/read-all", { method: "POST" }),
  adminLogin: (userId, password) => request("/admin/login", { method: "POST", body: JSON.stringify({ user_id: userId, password }) }),
  adminDashboard: (token) => request(`/admin/dashboard?token=${encodeURIComponent(token)}`),
  adminDeleteField: (token, id) => request(`/admin/fields/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`, { method: "DELETE" }),
  adminDeleteOrder: (token, id) => request(`/admin/orders/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`, { method: "DELETE" }),
  adminDeleteResult: (token, id) => request(`/admin/results/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`, { method: "DELETE" }),
  adminDeleteNotification: (token, id) => request(`/admin/notifications/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`, { method: "DELETE" }),
  adminDeleteUser: (token, id) => request(`/admin/users/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`, { method: "DELETE" }),
};
