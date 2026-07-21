const VERSION = "el-1.6.30-auction";
const API_BASE = "https://etiquetalivetiktok.satecnic.es";
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

async function signRequest(body, apiKey) {
  // HMAC-SHA256 real usando la propia API key del tenant como clave —
  // sustituye el hash de 32 bits + secreto placeholder que nunca se resolvía.
  // WebCrypto lanza "DataError: HMAC key data must not be empty" si la clave
  // está vacía (p. ej. justo tras instalar, antes de configurar la API key).
  if (!apiKey) return "";
  const enc = new TextEncoder();
  const str = typeof body === "string" ? body : JSON.stringify(body || {});
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(apiKey || ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(str));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getApiKey() {
  return new Promise((resolve) => {
    try { chrome.storage.local.get(["el_api_key"], (r) => resolve(r.el_api_key || "")); }
    catch (_) { resolve(""); }
  });
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
    return remoteConfig;
  } catch (_) {
    chrome.storage.local.get(["el_remote_config"], (r) => {
      if (r.el_remote_config && typeof r.el_remote_config === "object") remoteConfig = { ...DEFAULT_CONFIG, ...r.el_remote_config };
    });
    return remoteConfig;
  }
}

async function postToEtiquetaLive(path, data) {
  const apiKey = await getApiKey();
  if (!apiKey) return null; // sin clave configurada todavía, el servidor la rechazaría igualmente
  const body = JSON.stringify(data);
  return fetch(apiBase() + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-el-sign": await signRequest(body, apiKey),
      "x-api-key": apiKey
    },
    body
  }).catch(() => null);
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

// Cuando la pestaña de Seller está en segundo plano, Chrome puede congelar
// su JavaScript (temporizadores incluidos) para ahorrar recursos — así que
// pedirle a esa pestaña que se recargue sola con location.reload() no
// funciona de forma fiable: el mensaje llega, pero la propia pestaña no
// llega a ejecutar nada hasta que el usuario la enfoca (confirmado en
// producción: la recarga solo ocurría al hacer clic en la pestaña).
// chrome.tabs.reload() no tiene ese problema: actúa desde el background
// (que sí está despierto en ese momento) directamente sobre la pestaña,
// sin depender de que su JS esté activo.
let lastSellerReloadAt = 0;
// Visto en producción: las rondas de subasta pueden encadenarse cada
// 10-20s. Un cooldown de 45s (valor anterior) casi nunca llegaba a
// liberarse antes de la siguiente ronda, así que en la práctica casi
// nunca recargaba. Se baja a un valor por debajo del ritmo real de
// rondas, mientras sigue siendo mucho mayor que el intervalo de escaneo
// (2.5s) para no recargar por cada detección duplicada de la misma ronda.
const SELLER_RELOAD_COOLDOWN_MS = 6000;

function notifySellerOrderTabs(event) {
  try {
    chrome.tabs.query({ url: "https://seller-es.tiktok.com/order*" }, (tabs) => {
      console.log("[EtiquetaLive] background: pestañas de Seller encontradas:", (tabs || []).map((t) => t.id));
      for (const tab of tabs || []) {
        if (!tab?.id) continue;
        chrome.tabs.sendMessage(tab.id, { type: "EL_AUCTION_WINNER_DETECTED", event }, () => {
          if (chrome.runtime.lastError) {
            console.log("[EtiquetaLive] background: error enviando a tab", tab.id, chrome.runtime.lastError.message);
          } else {
            console.log("[EtiquetaLive] background: mensaje entregado a tab", tab.id);
          }
        });
      }

      const now = Date.now();
      if (now - lastSellerReloadAt < SELLER_RELOAD_COOLDOWN_MS) {
        console.log("[EtiquetaLive] background: recarga forzada de Seller en cooldown, se omite", {
          msRestantes: SELLER_RELOAD_COOLDOWN_MS - (now - lastSellerReloadAt),
        });
        return;
      }
      if (!tabs || !tabs.length) return;
      lastSellerReloadAt = now;
      for (const tab of tabs) {
        if (!tab?.id) continue;
        // Si la pestaña todavía está cargando (p. ej. de la recarga
        // anterior, que en Seller puede tardar varios segundos por lo
        // pesada que es la página), no se interrumpe con otra recarga —
        // eso dejaba la pestaña "atascada" cargando indefinidamente (visto
        // en producción). Se deja terminar y se reintenta en la siguiente
        // ronda, que llega de sobra a tiempo (10-20s después).
        chrome.tabs.get(tab.id, (freshTab) => {
          if (chrome.runtime.lastError) return;
          if (freshTab && freshTab.status === "loading") {
            console.log("[EtiquetaLive] background: tab", tab.id, "todavía está cargando, se omite esta recarga");
            return;
          }
          reloadSellerTab(tab.id);
        });
      }
    });
  } catch (e) {
    console.log("[EtiquetaLive] background: excepción en notifySellerOrderTabs", e);
  }
}

function reloadSellerTab(tabId) {
  chrome.tabs.reload(tabId, {}, () => {
    if (chrome.runtime.lastError) {
      console.log("[EtiquetaLive] background: error recargando tab", tabId, chrome.runtime.lastError.message);
    } else {
      console.log("[EtiquetaLive] background: recarga forzada de tab", tabId);
    }
  });
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
  ensurePolling(tabId);
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

function ensurePolling(tabId) {
  const state = getTabState(tabId);
  if (state.timer) return;
  state.timer = setInterval(() => pollTab(tabId, "interval"), Number(cfg("backgroundPollIntervalMs")) || 30000);
  setTimeout(() => pollTab(tabId, "captured_request"), 1500);
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
    console.log("[EtiquetaLive] background: EL_AUCTION_WINNER_DETECTED recibido", event);
    postToEtiquetaLive("/api/auction/event", { version: VERSION, event, forwardedAt: new Date().toISOString() });
    notifySellerOrderTabs(event);
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
