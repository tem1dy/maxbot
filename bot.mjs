import { existsSync, readFileSync } from "node:fs";
import crypto from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Bot, ImageAttachment, Keyboard } from "@maxhub/max-bot-api";

const root = dirname(fileURLToPath(import.meta.url));
function loadEnvFile() {
  const envFile = join(root, ".env");
  if (!existsSync(envFile)) return;
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}
function normalizeUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("MAX_APP_URL должен использовать HTTP или HTTPS");
  return url.toString().replace(/\/$/, "");
}
function sanitizeError(error) { return { name: error?.name ?? "Error", message: error?.message ?? String(error), code: error?.code ?? error?.status ?? error?.statusCode ?? null, response: error?.response?.data ?? error?.body ?? error?.response ?? null }; }
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function getCurrentBotInfo(token) {
  const response = await fetch("https://platform-api2.max.ru/me", { headers: { Authorization: token, Accept: "application/json" } });
  const raw = await response.text();
  let data; try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) { const error = new Error(`MAX /me вернул HTTP ${response.status}`); error.status = response.status; error.body = data; throw error; }
  return data;
}

loadEnvFile();
const token = process.env.MAX_BOT_TOKEN;
const appUrl = normalizeUrl(process.env.MAX_APP_URL || "");
if (!token) throw new Error("MAX_BOT_TOKEN не найден в .env");
const bot = new Bot(token);
let botInfo = null;
let openAppKeyboard = null;
let fallbackKeyboard = null;
const pendingAdmin = new Map();

function appDeepLink(payload = "") {
  const username = String(botInfo?.username || process.env.MAX_BOT_USERNAME || "").replace(/^@/, "").trim();
  if (!username) {
    console.error("Не удалось построить MAX deep link: не указан username бота");
    return appUrl;
  }
  return `https://max.ru/${username}?startapp=${encodeURIComponent(payload)}`;
}
function startPayload(path = "") {
  const cleaned = String(path || "").replace(/^\//, "");
  if (cleaned.startsWith("farmer/orders/")) return `order_${cleaned.split("/").pop()}`;
  if (cleaned.startsWith("operator/orders/")) return `order_${cleaned.split("/").pop()}`;
  if (cleaned.startsWith("farmer/results")) return `result_latest`;
  return "";
}
function buildOpenAppButton() {
  const username = String(botInfo?.username || "").replace(/^@/, "").trim();
  const id = Number(botInfo?.user_id ?? botInfo?.id ?? 0);
  const webApp = username ? `https://max.ru/${username}` : undefined;
  return Keyboard.button.openApp("Открыть Поле рядом", webApp, Number.isSafeInteger(id) && id > 0 ? id : undefined);
}

async function initialize() {
  const configuredId = process.env.MAX_BOT_ID?.trim();
  const configuredUsername = process.env.MAX_BOT_USERNAME?.trim().replace(/^@/, "");
  botInfo = configuredId ? { user_id: Number(configuredId), source: "MAX_BOT_ID" } : configuredUsername ? { username: configuredUsername, source: "MAX_BOT_USERNAME" } : await getCurrentBotInfo(token);
  if (!botInfo?.username) {
    try {
      const fetched = await getCurrentBotInfo(token);
      botInfo = { ...botInfo, username: fetched?.username };
    } catch {}
  }
  const id = Number(botInfo?.user_id ?? botInfo?.id ?? 0);
  const username = String(botInfo?.username ?? "").replace(/^@/, "").trim();
  botInfo = { user_id: Number.isSafeInteger(id) && id > 0 ? id : undefined, username: username || undefined, source: botInfo?.source || "MAX /me" };
  openAppKeyboard = Keyboard.inlineKeyboard([[buildOpenAppButton()]]);
  fallbackKeyboard = Keyboard.inlineKeyboard([[Keyboard.button.link("Открыть Поле рядом", username ? `https://max.ru/${username}?startapp` : appUrl)]]);
  console.log("MAX open_app готов", { botId: botInfo.user_id ?? null, botUsername: botInfo.username ?? null, appUrl });
}

async function syncProfileFromContext(ctx) {
  const raw = ctx.user || ctx.message?.sender || {};
  const id = Number(raw?.user_id || raw?.id || 0);
  if (!Number.isSafeInteger(id) || id <= 0) return;
  const name = [raw?.first_name, raw?.last_name].filter(Boolean).join(" ") || raw?.name || "Пользователь MAX";
  let username = String(raw?.username || "").replace(/^@/, "").trim();
  const chatId = Number(ctx.message?.recipient?.chat_id || ctx.message?.recipient?.chatId || ctx.message?.chat_id || 0);
  if (!username && Number.isSafeInteger(chatId) && chatId > 0) {
    try {
      const response = await fetch(`https://platform-api2.max.ru/chats/${encodeURIComponent(chatId)}`, { headers: { Authorization: token, Accept: "application/json" } });
      if (response.ok) {
        const chat = await response.json();
        username = String(chat?.dialog_with_user?.username || "").replace(/^@/, "").trim();
      }
    } catch (error) { console.error("Не удалось получить username диалога MAX", sanitizeError(error)); }
  }
  try {
    await fetch(`${appUrl}/api/bot/users/sync`, { method: "POST", headers: { "Content-Type": "application/json", "X-Bot-Token": internalNotificationToken() }, body: JSON.stringify({ max_user_id: String(id), name, username }) });
  } catch (error) { console.error("Не удалось синхронизировать профиль MAX", sanitizeError(error)); }
}

bot.on("bot_started", async (ctx) => {
  await syncProfileFromContext(ctx);
  try { await ctx.reply("Чтобы начать работу с «Поле рядом», отправьте команду /start."); } catch (error) { console.error("Ошибка подсказки первого запуска", sanitizeError(error)); }
});

bot.command("start", async (ctx) => {
  await syncProfileFromContext(ctx);
  const attachments = [new ImageAttachment({ url: `${appUrl}/pole-ryadom-welcome-new.jpg` }).toJson()];
  if (openAppKeyboard || fallbackKeyboard) attachments.push(openAppKeyboard || fallbackKeyboard);
  try {
    await ctx.reply("Добро пожаловать в «Поле рядом»!\n\nЗакажите облёт поля, найдите оператора агродрона и получите результат в одном месте.", { attachments });
  } catch (error) {
    console.error("Не удалось отправить стартовое сообщение", { error: sanitizeError(error), bot: botInfo });
  }
});

async function beginAdminAuth(ctx) {
  const id = Number(ctx.user?.user_id || ctx.message?.sender?.user_id || 0);
  const botUsername = String(botInfo?.username || "").replace(/^@/, "").trim();
  if (!Number.isSafeInteger(id) || id <= 0) return ctx.reply("Не удалось определить пользователя MAX.");
  pendingAdmin.set(id, { attempts: 0, expires: Date.now() + 120000, promptedAt: Date.now() });
  return ctx.reply("Введите пароль администратора одним сообщением.");
}

try { bot.command("admin", beginAdminAuth); } catch (error) { console.error("Не удалось зарегистрировать /admin handler", sanitizeError(error)); }

bot.on("message_created", async (ctx, next) => {
  await syncProfileFromContext(ctx);
  const id = Number(ctx.user?.user_id || ctx.message?.sender?.user_id || 0);
  const text = String(ctx.message?.body?.text || "").trim();
  if (/^\/admin(?:@\w+)?$/.test(text)) {
    const pending = pendingAdmin.get(id);
    if (pending && Date.now() - (pending.promptedAt || 0) < 1500) return;
    return beginAdminAuth(ctx);
  }
  const pending = pendingAdmin.get(id);
  if (pending && !text.startsWith("/")) {
    if (Date.now() > pending.expires) { pendingAdmin.delete(id); return ctx.reply("Сессия ввода пароля истекла. Повторите /admin."); }
    pending.attempts += 1;
    if (pending.attempts > 5) { pendingAdmin.delete(id); return ctx.reply("Слишком много попыток. Повторите /admin позже."); }
    try {
      const response = await fetch(`${appUrl}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ user_id: String(id), password: text }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return ctx.reply(data.detail || "Неверный пароль администратора.");
      pendingAdmin.delete(id);
      const adminUrl = new URL("/admin", appUrl);
      adminUrl.searchParams.set("token", data.token);
      const adminButton = Keyboard.button.link("Открыть панель администратора", adminUrl.toString());
      return ctx.reply("Доступ подтверждён. Откройте панель администратора.", { attachments: [Keyboard.inlineKeyboard([[adminButton]])] });
    } catch (error) { console.error("Ошибка admin login", sanitizeError(error)); return ctx.reply("Не удалось проверить пароль. Попробуйте ещё раз."); }
  }
  if (!text.startsWith("/")) return ctx.reply("Чтобы открыть сервис, отправьте /start.");
  return next?.();
});

function internalNotificationToken() { return crypto.createHmac("sha256", token).update("agromax-notifications").digest("hex"); }

async function flushNotifications() {
  const internal = internalNotificationToken();
  try {
    const response = await fetch(`${appUrl}/api/bot/notifications`, { headers: { Accept: "application/json", "X-Bot-Token": internal } });
    if (!response.ok) throw new Error(`notification queue HTTP ${response.status}`);
    for (const item of await response.json()) {
      const userId = Number(item.max_user_id);
      if (!Number.isSafeInteger(userId) || userId <= 0) continue;
      try {
        const attachments = [];
        const buttons = [];
        if (item.action_path) {
          const payload = startPayload(item.action_path);
          const url = payload ? appDeepLink(payload) : appUrl;
          const label = String(item.type).includes("COMPLETED") ? "Открыть результат" : "Открыть заказ";
          buttons.push(Keyboard.button.link(label, url));
        }
        if (item.contact_username) buttons.push(Keyboard.button.link(`@${String(item.contact_username).replace(/^@/, "")} · Написать`, `https://max.ru/${String(item.contact_username).replace(/^@/, "")}`));
        if (buttons.length) attachments.push(Keyboard.inlineKeyboard([buttons.slice(0, 2)]));
        const contactLabel = String(item.type).includes("OFFER_ACCEPTED") ? "Фермер" : "Исполнитель";
        const safeTitle = escapeHtml(item.title);
        const safeMessage = escapeHtml(item.message);
        const safeContact = item.contact_username ? `\n\n${escapeHtml(contactLabel)}: @${escapeHtml(String(item.contact_username).replace(/^@/, ""))}` : "";
        const messageText = `<b>${safeTitle}</b>\n\n${safeMessage}${safeContact}`;
        const maxResponse = await fetch(`https://platform-api2.max.ru/messages?user_id=${encodeURIComponent(userId)}`, { method: "POST", headers: { Authorization: token, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ text: messageText, format: "html", attachments, notify: true }) });
        const raw = await maxResponse.text();
        if (!maxResponse.ok) throw new Error(`MAX message HTTP ${maxResponse.status}: ${raw.slice(0, 500)}`);
        await fetch(`${appUrl}/api/bot/notifications/${encodeURIComponent(item.id)}/delivered`, { method: "POST", headers: { "X-Bot-Token": internal } });
        console.log("Уведомление MAX доставлено", { notificationId: item.id, userId });
      } catch (sendError) { console.error("Не удалось доставить уведомление в MAX", { notificationId: item.id, userId, error: sanitizeError(sendError) }); }
    }
  } catch (error) { console.error("Не удалось получить очередь уведомлений", sanitizeError(error)); }
}

await initialize();
flushNotifications();
setInterval(flushNotifications, 5000);
bot.catch((error) => console.error("MAX Bot API error", sanitizeError(error)));
console.log("MAX-бот запущен. Ожидаю /start и /admin");
await bot.start({ mode: "polling" });
