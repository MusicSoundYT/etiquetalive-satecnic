const VERSION = "el-1.9.7-dynamic-reconcile-delay-20260610";
const API_BASE = "https://etiquetalive.satecnic.es";

// ═══════════════════════════════════════════════════════════
// C4-F M3 — Device Heartbeat (v1.7.0-beta)
// ═══════════════════════════════════════════════════════════
const HEARTBEAT_ALARM_NAME = "el_heartbeat";
const HEARTBEAT_PERIOD_MIN = 5;
const HEARTBEAT_PATH = "/api/v3/devices/heartbeat";
const DEFAULT_CONFIG = {
  configVersion: "local-default-1",
  apiBase: API_BASE,
  enableApiReplay: true,
  enableControlledRefreshFallback: true,
  backgroundPollIntervalMs: 30000,
  maxCapturedRequests: 8,
  maxReplayRequestsPerPoll: 3,
  maxApiOrdersPerScan: 20,
  extensionConfigRefreshMs: 300000,
  minExtensionVersion: "1.5.0",
  updateMessage: ""
};

let remoteConfig = { ...DEFAULT_CONFIG };

const stateByTab = new Map();
const auctionEventAtBySig = new Map();

async function signRequest(body, apiKey) {
  // HMAC-SHA256 real usando la propia API key del tenant como clave —
  // sustituye el hash de 32 bits + secreto placeholder que nunca se resolvía.
  const enc = new TextEncoder();
  const str = typeof body === "string" ? body : JSON.stringify(body || {});
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(apiKey || ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(str));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function cfg(key) {
  return remoteConfig?.[key] ?? DEFAULT_CONFIG[key];
}

function apiBase() {
  return String(cfg("apiBase") || API_BASE).replace(/\/+$/, "");
}

async function refreshRemoteConfig(reason = "startup") {
  try {
    const url = apiBase() + "/api/extension/config?version=" + encodeURIComponent(VERSION) + "&reason=" + encodeURIComponent(reason);
    const res = await fetch(url, { cache: "no-store", headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error("config_http_" + res.status);
    const data = await res.json();
    if (!data || typeof data !== "object") throw new Error("config_invalid");
    remoteConfig = { ...DEFAULT_CONFIG, ...data };
    chrome.storage.local.set({ el_remote_config: remoteConfig, el_remote_config_at: Date.now() });
    // Broadcast reconcile delay to Live tabs
    const delayMs = Number(remoteConfig.reconcileDelayMs) || 6000;
    chrome.tabs.query({ url: ["https://shop.tiktok.com/streamer/*"] }, (tabs) => {
      for (const tab of (tabs || [])) {
        chrome.tabs.sendMessage(tab.id, { type: "EL_CONFIG_UPDATE", reconcileDelayMs: delayMs }).catch(() => {});
      }
    });
    return remoteConfig;
  } catch (_) {
    chrome.storage.local.get(["el_remote_config"], (r) => {
      if (r.el_remote_config && typeof r.el_remote_config === "object") remoteConfig = { ...DEFAULT_CONFIG, ...r.el_remote_config };
    });
    return remoteConfig;
  }
}

async function postToEtiquetaLive(path, data) {
  const body = JSON.stringify(data);
  let apiKey = "";
  try {
    const stored = await getStored(["el_api_key"]);
    apiKey = stored.el_api_key || "";
  } catch (_) {}
  return fetch(apiBase() + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-el-sign": await signRequest(body, apiKey),
      ...(apiKey ? { "x-api-key": apiKey } : {})
    },
    body
  }).catch(() => null);
}

function auctionEventSig(event) {
  const ev = event || {};
  return [
    ev.source || "",
    ev.winner || "",
    ev.productName || "",
    ev.price || "",
    ev.auctionId || ""
  ].join("|").toLowerCase().slice(0, 700);
}

function shouldForwardAuctionEvent(event) {
  const sig = auctionEventSig(event);
  if (!sig.trim()) return false;
  const now = Date.now();
  const lastAt = auctionEventAtBySig.get(sig) || 0;
  if (now - lastAt < 60000) return false;
  auctionEventAtBySig.set(sig, now);
  for (const [key, at] of auctionEventAtBySig.entries()) {
    if (now - at > 300000) auctionEventAtBySig.delete(key);
  }
  return true;
}

function looksLikeAuctionApi(req) {
  const haystack = [req.url, req.body, JSON.stringify(req.headers || {})].filter(Boolean).join(" ").toLowerCase();
  if (!haystack) return false;
  if (!/(auction|bid|winner|won|live|streamer|product|subasta|ganador|buyer)/i.test(haystack)) return false;
  if (/(captcha|analytics|log|report|pixel|webcast|impression|performance|sentry|slardar)/i.test(haystack)) return false;
  return true;
}

function rememberAuctionRequest(req) {
  if (!looksLikeAuctionApi(req)) return;
  postToEtiquetaLive("/api/auction/request", {
    version: VERSION,
    capturedAt: new Date().toISOString(),
    request: {
      url: String(req.url || "").slice(0, 1200),
      method: req.method || "GET",
      pageUrl: req.pageUrl || "",
      source: req.source || "unknown",
      bodyHint: String(req.body || "").slice(0, 1200)
    }
  });
}

function notifySellerOrderTabs(event) {
  try {
    chrome.tabs.query({ url: "https://seller-es.tiktok.com/order*" }, (tabs) => {
      for (const tab of tabs || []) {
        if (!tab?.id) continue;
        chrome.tabs.sendMessage(tab.id, { type: "EL_AUCTION_WINNER_DETECTED", event }, () => void chrome.runtime.lastError);
      }
    });
  } catch (_) {}
}

function notifyLiveScreenTabs(payload) {
  try {
    chrome.tabs.query({ url: "https://etiquetalive.satecnic.es/live-screen.html*" }, (tabs) => {
      for (const tab of tabs || []) {
        if (!tab?.id) continue;
        chrome.tabs.sendMessage(tab.id, payload, () => void chrome.runtime.lastError);
      }
    });
  } catch (_) {}
}

function safeUrl(url, baseUrl) {
  try {
    const resolved = new URL(url, baseUrl || "https://seller-es.tiktok.com");
    if (resolved.hostname !== "seller-es.tiktok.com") return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

function looksLikeOrderApi(req) {
  const haystack = [req.url, req.body, JSON.stringify(req.headers || {})].filter(Boolean).join(" ").toLowerCase();
  if (!haystack) return false;
  if (!/(order|orders|fulfillment|shipment|package|seller_order|reverse_order|search_order)/i.test(haystack)) return false;
  if (/(captcha|analytics|log|report|pixel|webcast|impression|performance|sentry)/i.test(haystack)) return false;
  return true;
}

function getTabState(tabId) {
  if (!stateByTab.has(tabId)) {
    stateByTab.set(tabId, {
      requests: [],
      timer: null,
      inFlight: false,
      seenSig: "",
      lastPollAt: 0,
      consecutiveFailures: 0
    });
  }
  return stateByTab.get(tabId);
}

function rememberRequest(tabId, req) {
  if (!cfg("enableApiReplay")) return;
  if (!looksLikeOrderApi(req)) return;
  const url = safeUrl(req.url, req.pageUrl);
  if (!url) return;

  const state = getTabState(tabId);
  const normalized = {
    url,
    method: (req.method || "GET").toUpperCase(),
    body: typeof req.body === "string" ? req.body : undefined,
    headers: sanitizeHeaders(req.headers || {}),
    capturedAt: new Date().toISOString()
  };

  const key = `${normalized.method} ${normalized.url} ${normalized.body || ""}`;
  state.requests = state.requests.filter(r => `${r.method} ${r.url} ${r.body || ""}` !== key);
  state.requests.unshift(normalized);
  state.requests = state.requests.slice(0, Number(cfg("maxCapturedRequests")) || 8);
}

function sanitizeHeaders(headers) {
  const out = {};
  const allowed = ["content-type", "accept", "x-secsdk-csrf-token", "x-tt-token", "x-tt-csrf-token", "x-use-ppe", "x-tt-env"];
  for (const [k, v] of Object.entries(headers || {})) {
    const key = String(k).toLowerCase();
    if (allowed.includes(key) && typeof v === "string") out[k] = v;
  }
  if (!out.Accept && !out.accept) out.Accept = "application/json, text/plain, */*";
  return out;
}

async function pollTab(tabId, reason) {
  const state = getTabState(tabId);
  if (state.inFlight || !state.requests.length) return;
  state.inFlight = true;
  state.lastPollAt = Date.now();

  try {
    for (const req of state.requests.slice(0, Number(cfg("maxReplayRequestsPerPoll")) || 3)) {
      const result = await replayRequest(req);
      if (!result) continue;
      const cards = extractOrderCards(result.data);
      const sig = cards.map(c => c.orderNumber).sort().join("|") + ":" + result.text.slice(0, 240);
      if (cards.length && sig !== state.seenSig) {
        state.seenSig = sig;
        state.consecutiveFailures = 0;
        await postToEtiquetaLive("/api/orders/scan", {
          version: VERSION,
          reason: `background_${reason}`,
          href: req.url,
          capturedAt: new Date().toISOString(),
          source: "tiktok_order_api_replay",
          count: cards.length,
          cards
        });
        chrome.tabs.sendMessage(tabId, { type: "EL_BACKGROUND_SYNC_OK", count: cards.length }).catch(() => {});
        break;
      }
    }
  } catch {
    state.consecutiveFailures += 1;
  } finally {
    state.inFlight = false;
  }
}

async function replayRequest(req) {
  const init = {
    method: req.method,
    credentials: "include",
    cache: "no-store",
    headers: req.headers || {}
  };
  if (req.method !== "GET" && req.method !== "HEAD" && req.body) init.body = req.body;
  const res = await fetch(req.url, init);
  const text = await res.text();
  if (!res.ok || !text) return null;
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { data, text };
}

function extractOrderCards(data) {
  const cardsById = new Map();

  function walk(node, context = []) {
    if (!node || context.length > 10) return;
    if (Array.isArray(node)) {
      for (const item of node.slice(0, 300)) walk(item, context);
      return;
    }
    if (typeof node !== "object") return;

    const text = JSON.stringify(node).slice(0, 6000);
    const id = findOrderId(node, text);
    if (id && /subasta|auction|pedido|order|shipment|fulfill|label/i.test(text)) {
      const parsed = parseApiOrder(node, text, id);
      cardsById.set(id, {
        orderNumber: id,
        hasSubasta: /subasta|auction/i.test(text),
        parsed,
        raw: text,
        lines: compactLines(text),
        source: "api"
      });
    }

    for (const value of Object.values(node)) walk(value, context.concat(node));
  }

  walk(data);
  return Array.from(cardsById.values()).slice(0, Number(cfg("maxApiOrdersPerScan")) || 20);
}

function findOrderId(obj, text) {
  const keys = ["order_id", "orderId", "order_sn", "orderSn", "order_no", "orderNo", "order_number", "orderNumber", "main_order_id", "mainOrderId"];
  for (const key of keys) {
    const value = obj?.[key];
    const str = String(value || "");
    if (/^\d{12,}$/.test(str)) return str;
  }
  return (String(text || "").match(/\b\d{15,}\b/) || [])[0] || "";
}

function parseApiOrder(obj, text, orderId) {
  const price = findFirst(text, /(?:total|amount|price|payment|paid|importe|precio)[^0-9]{0,40}(\d{1,6}(?:[,.]\d{1,2})?\s*(?:€|EUR)?)/i);
  const customer = findValueByKey(obj, /buyer|customer|recipient|receiver|name|nombre/i);
  const orderDate = findFirst(text, /(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?)/) || findValueByKey(obj, /create.*time|order.*time|paid.*time|date/i);
  return {
    orderId,
    customer: cleanScalar(customer),
    price: cleanScalar(price),
    orderDate: cleanScalar(orderDate),
    type: /subasta|auction/i.test(text) ? "Subasta" : "Pedido",
    complete: Boolean(orderId)
  };
}

function findFirst(text, re) {
  const m = String(text || "").match(re);
  return m ? m[1] : "";
}

function findValueByKey(node, keyRe, depth = 0) {
  if (!node || depth > 5 || typeof node !== "object") return "";
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findValueByKey(item, keyRe, depth + 1);
      if (found) return found;
    }
    return "";
  }
  for (const [key, value] of Object.entries(node)) {
    if (keyRe.test(key) && ["string", "number"].includes(typeof value)) return String(value);
  }
  for (const value of Object.values(node)) {
    const found = findValueByKey(value, keyRe, depth + 1);
    if (found) return found;
  }
  return "";
}

function cleanScalar(value) {
  return String(value || "").replace(/\\u002F/g, "/").replace(/\\/g, "").replace(/^"|"$/g, "").trim().slice(0, 160);
}

function compactLines(text) {
  return String(text || "")
    .replace(/[{}[\]",]/g, " ")
    .split(/\s{2,}|\|/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 80);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender?.tab?.id;
  if (!tabId) return false;

  if (message?.type === "EL_TIKTOK_ORDER_REQUEST") {
    rememberRequest(tabId, message.request || {});
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "EL_FORCE_BACKGROUND_POLL") {
    pollTab(tabId, "manual");
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "EL_TIKTOK_AUCTION_REQUEST") {
    rememberAuctionRequest(message.request || {});
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "EL_AUCTION_WINNER_DETECTED") {
    const event = message.event || {};
    if (shouldForwardAuctionEvent(event)) {
      postToEtiquetaLive("/api/auction/event", { version: VERSION, event, forwardedAt: new Date().toISOString() });
    }
    notifyLiveScreenTabs({
      type: "EL_AUCTION_AWARDED",
      winner: event.winner || "",
      price: event.price || "",
      productName: event.productName || "",
      source: "auction_winner_detected",
      at: new Date().toISOString()
    });
    notifySellerOrderTabs(event);
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "EL_AUCTION_CRONO_TICK") {
    notifyLiveScreenTabs({
      type: "EL_CHRONO_TICK",
      seconds: message.seconds,
      totalSeconds: message.totalSeconds || 60,
      label: message.label || "",
      source: "tiktok_crono",
      at: new Date().toISOString()
    });
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

chrome.tabs.onRemoved.addListener(tabId => {
  const state = stateByTab.get(tabId);
  if (state?.timer) clearInterval(state.timer);
  stateByTab.delete(tabId);
});

refreshRemoteConfig("startup");
setInterval(() => refreshRemoteConfig("interval"), Number(cfg("extensionConfigRefreshMs")) || 300000);

// ═══════════════════════════════════════════════════════════
// C4-F M3 — Device Heartbeat implementation
// ═══════════════════════════════════════════════════════════

function genDeviceId() {
  // Genera UUID v4 sin depender de crypto.randomUUID (no siempre en SW)
  const hex = [];
  for (let i = 0; i < 16; i++) hex.push(Math.floor(Math.random() * 256));
  hex[6] = (hex[6] & 0x0f) | 0x40;
  hex[8] = (hex[8] & 0x3f) | 0x80;
  const s = hex.map(b => b.toString(16).padStart(2, "0")).join("");
  return s.slice(0, 8) + "-" + s.slice(8, 12) + "-" + s.slice(12, 16) + "-" + s.slice(16, 20) + "-" + s.slice(20);
}

function detectChromeVersion() {
  try {
    const m = (self.navigator?.userAgent || "").match(/Chrome\/([\d.]+)/);
    return m ? m[1] : "unknown";
  } catch (_) { return "unknown"; }
}

function detectOsPlatform() {
  try {
    const ua = self.navigator?.userAgent || "";
    if (/Windows/i.test(ua)) return "Windows";
    if (/Mac OS X/i.test(ua)) return "macOS";
    if (/Linux/i.test(ua)) return "Linux";
    if (/Android/i.test(ua)) return "Android";
    if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
    return "Unknown";
  } catch (_) { return "Unknown"; }
}

function buildDeviceName() {
  return "Chrome " + detectChromeVersion().split(".")[0] + " on " + detectOsPlatform();
}

async function ensureDeviceId() {
  return new Promise(resolve => {
    chrome.storage.local.get(["el_device_id"], r => {
      if (r.el_device_id && typeof r.el_device_id === "string" && r.el_device_id.length > 8) {
        resolve(r.el_device_id);
      } else {
        const id = genDeviceId();
        chrome.storage.local.set({ el_device_id: id }, () => resolve(id));
      }
    });
  });
}

async function getStored(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, r => resolve(r || {})));
}

async function setStored(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, () => resolve()));
}

async function showRevokedNotification() {
  try {
    chrome.notifications.create("el_revoked_" + Date.now(), {
      type: "basic",
      iconUrl: "icon128.png",
      title: "EtiquetaLive — Dispositivo revocado",
      message: "Tu sesión en este dispositivo fue revocada. La impresión está pausada. Contacta soporte @Dvid_woow en Telegram.",
      priority: 2
    }, () => void chrome.runtime.lastError);
  } catch (_) {}
}

async function sendHeartbeat(reason = "interval") {
  try {
    const stored = await getStored([
      "el_api_key", "el_device_id", "el_labels_printed_pending", "el_revoked"
    ]);
    if (!stored.el_api_key) return; // sin api_key no podemos heartbeatear
    const deviceId = await ensureDeviceId();
    const labelsDelta = Number(stored.el_labels_printed_pending || 0);

    const body = JSON.stringify({
      device_id: deviceId,
      device_name: buildDeviceName(),
      chrome_version: detectChromeVersion(),
      os_platform: detectOsPlatform(),
      labels_printed_delta: labelsDelta,
      extension_version: VERSION,
      reason
    });

    const res = await fetch(apiBase() + HEARTBEAT_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": stored.el_api_key,
        "x-el-sign": await signRequest(body, stored.el_api_key)
      },
      body
    }).catch(() => null);

    if (!res) return;

    if (res.status === 200) {
      // Reset contador local de labels enviados
      await setStored({ el_labels_printed_pending: 0, el_last_heartbeat_at: Date.now() });
      // Si estábamos revocados y ahora ok → limpiar flag
      if (stored.el_revoked) await setStored({ el_revoked: false });
      return;
    }

    if (res.status === 403) {
      // Posible device_revoked
      let payload = null;
      try { payload = await res.json(); } catch (_) {}
      if (payload && (payload.reason === "device_revoked" || payload.status === "revoked")) {
        if (!stored.el_revoked) {
          await setStored({ el_revoked: true, el_revoked_at: Date.now() });
          showRevokedNotification();
        }
      }
      return;
    }

    // 401, 5xx → silencioso, reintenta próximo ciclo
  } catch (_) {
    // network error → silencioso
  }
}

// Crear alarm al instalar/actualizar la extensión
chrome.runtime.onInstalled.addListener(async () => {
  await ensureDeviceId();
  try {
    chrome.alarms.create(HEARTBEAT_ALARM_NAME, {
      delayInMinutes: 1,
      periodInMinutes: HEARTBEAT_PERIOD_MIN
    });
  } catch (_) {}
  // Heartbeat inmediato si ya hay api_key (instalación previa)
  const r = await getStored(["el_api_key"]);
  if (r.el_api_key) sendHeartbeat("install");
});

// Recrear alarm si se perdió tras restart del service worker
chrome.runtime.onStartup.addListener(async () => {
  await ensureDeviceId();
  try {
    chrome.alarms.get(HEARTBEAT_ALARM_NAME, (alarm) => {
      if (!alarm) {
        chrome.alarms.create(HEARTBEAT_ALARM_NAME, {
          delayInMinutes: 1,
          periodInMinutes: HEARTBEAT_PERIOD_MIN
        });
      }
    });
  } catch (_) {}
});

// Listener del alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name === HEARTBEAT_ALARM_NAME) {
    sendHeartbeat("alarm");
  }
});

// Mensajes adicionales para C4-F M3
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "EL_HEARTBEAT_NOW") {
    sendHeartbeat("manual");
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === "EL_INCREMENT_LABELS_PRINTED") {
    const inc = Math.max(0, Number(message.count || 1));
    chrome.storage.local.get(["el_labels_printed_pending"], r => {
      const next = Number(r.el_labels_printed_pending || 0) + inc;
      chrome.storage.local.set({ el_labels_printed_pending: next });
    });
    sendResponse({ ok: true });
    return false;
  }
  // C4-F M3.1 — Crono Watcher disparó reconciliación controlada
  if (message?.type === "EL_AUCTION_CRONO_ZERO") {
    try {
      console.log("[EtiquetaLive Background][diagnóstico] Crono 0:00 recibido", "attempt", message.attempt, "fromTab", sender?.tab?.id, "href", message.href);
    } catch (_) {}
    try {
      const attempt = Math.max(1, Math.min(4, Number(message.attempt || 1)));
      notifyLiveScreenTabs({
        type: "EL_AUCTION_CLOSING",
        seconds: 0,
        source: "tiktok_crono_zero",
        at: new Date().toISOString()
      });
      chrome.tabs.query({ url: ["https://seller-es.tiktok.com/order*", "https://seller-es.tiktok.com/*order*"] }, (tabs) => {
        const queryError = chrome.runtime.lastError?.message || "";
        const sellerTabs = tabs || [];
        const results = [];
        try {
          console.log("[EtiquetaLive Background][diagnóstico] Seller tabs encontradas", sellerTabs.length, queryError ? "queryError=" + queryError : "");
        } catch (_) {}
        if (!sellerTabs.length) {
          sendResponse({ ok: false, stage: "seller_tabs_query", sellerTabs: 0, queryError });
          return;
        }
        let pending = sellerTabs.length;
        const finish = () => {
          pending -= 1;
          if (pending > 0) return;
          const hasError = results.some(r => r.error);
          sendResponse({ ok: !hasError, stage: "seller_send", sellerTabs: sellerTabs.length, results });
        };
        for (const tab of sellerTabs) {
          if (!tab?.id) continue;
          try {
            chrome.storage.local.set({
              el_crono_reconcile_until: Date.now() + 20000,
              el_crono_reconcile_attempt: attempt
            });
          } catch (_) {}
          try {
            console.log("[EtiquetaLive Background][diagnóstico] Enviando reconcile a Seller", "tab", tab.id, "url", tab.url || "(sin url)", "attempt", attempt);
          } catch (_) {}
          pollTab(tab.id, "crono_zero_" + attempt);
          chrome.tabs.sendMessage(tab.id, {
            type: "EL_AUCTION_CRONO_RECONCILE",
            event: {
              source: "crono_zero_reconcile",
              at: new Date().toISOString(),
              attempt,
              delayMs: message.delayMs || 0,
              maxAttempts: message.maxAttempts || 4
            }
          }, () => {
            const error = chrome.runtime.lastError?.message || "";
            if (error) {
              try { console.warn("[EtiquetaLive Background][diagnóstico] Error enviando a Seller", "tab", tab.id, error); } catch (_) {}
            } else {
              try { console.log("[EtiquetaLive Background][diagnóstico] Mensaje entregado a Seller", "tab", tab.id); } catch (_) {}
            }
            if (attempt === 1) {
              try {
                console.log("[EtiquetaLive Background][diagnóstico] reload Seller Orders único", "tab", tab.id);
              } catch (_) {}
              try { chrome.tabs.reload(tab.id, { bypassCache: true }); } catch (_) {}
            }
            results.push({ tabId: tab.id, url: tab.url || "", ok: !error, error });
            finish();
          });
          try {
            console.log("[EtiquetaLive Background] Seller notificado con reload controlado", "tab", tab.id, "attempt", attempt);
          } catch (_) {}
        }
      });
    } catch (err) {
      sendResponse({ ok: false, stage: "background_exception", error: String(err?.message || err || "unknown") });
    }
    return true;
  }
  return false;
});

// Click en notificación de revoked → abrir popup
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith("el_revoked_")) {
    try { chrome.action.openPopup(); } catch (_) {}
    try { chrome.notifications.clear(notificationId); } catch (_) {}
  }
});
