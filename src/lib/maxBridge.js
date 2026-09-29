function maxWebApp() { return window.WebApp || window.Max?.WebApp || null; }

export function isMaxRuntime() { return Boolean(maxWebApp()); }
export function getMaxPlatform() { return maxWebApp()?.platform || "browser"; }

export function openMaxLink(url) {
  const webApp = maxWebApp();
  if (typeof webApp?.openMaxLink === "function") return webApp.openMaxLink(url);
  window.open(url, "_blank", "noopener,noreferrer");
}

function absoluteHttpsUrl(url) { return new URL(url, window.location.origin).href; }

export async function downloadMaxFile(url, fileName) {
  const absoluteUrl = absoluteHttpsUrl(url);
  const webApp = maxWebApp();
  if (typeof webApp?.downloadFile === "function" && absoluteUrl.startsWith("https:")) {
    await webApp.downloadFile(absoluteUrl, fileName);
    return;
  }
  const response = await fetch(absoluteUrl, { credentials: "include" });
  if (!response.ok) {
    let detail = "Не удалось скачать файл";
    try { const payload = await response.json(); detail = payload.detail || detail; } catch {}
    throw new Error(detail);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl; anchor.download = fileName || "pole-ryadom-result";
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

export async function openMaxFile(url) {
  const absoluteUrl = absoluteHttpsUrl(url);
  const webApp = maxWebApp();
  if (typeof webApp?.openLink === "function") {
    try { webApp.openLink(absoluteUrl); return; } catch {}
  }
  const response = await fetch(absoluteUrl, { credentials: "include" });
  if (!response.ok) {
    let detail = "Не удалось открыть файл";
    try { const payload = await response.json(); detail = payload.detail || detail; } catch {}
    throw new Error(detail);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const opened = window.open(objectUrl, "_blank", "noopener,noreferrer");
  if (!opened) {
    const anchor = document.createElement("a"); anchor.href = objectUrl; anchor.target = "_blank";
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
  }
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}

export async function shareMaxContent({ text = "", link = "" } = {}) {
  const webApp = maxWebApp();
  if (typeof webApp?.shareMaxContent === "function") return webApp.shareMaxContent({ ...(text ? { text } : {}), ...(link ? { link } : {}) });
  if (navigator.share) return navigator.share({ text, ...(link ? { url: link } : {}) });
  if (navigator.clipboard) return navigator.clipboard.writeText([text, link].filter(Boolean).join("\n"));
  throw new Error("Шеринг недоступен в этом браузере");
}

export function notifyMax(type = "success") {
  const webApp = maxWebApp();
  const fn = webApp?.HapticFeedback?.notificationOccurred;
  if (typeof fn === "function") { try { fn.call(webApp.HapticFeedback, type); } catch {} }
}
export function getMaxBackButton() { return maxWebApp()?.BackButton || null; }
