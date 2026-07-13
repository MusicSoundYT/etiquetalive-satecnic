(() => {
  const VERSION = "el-1.9.7-dynamic-reconcile-delay-20260610";
  const API_BASE = "https://etiquetalive.satecnic.es";

  // C4-F M3 — Early-return si dispositivo revocado
  // Listener síncrono: si el flag cambia, dejamos de operar al instante
  let __el_revoked = false;
  try {
    chrome.storage.local.get(["el_revoked"], r => { __el_revoked = Boolean(r?.el_revoked); });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && "el_revoked" in changes) {
        __el_revoked = Boolean(changes.el_revoked.newValue);
      }
    });
  } catch (_) {}
  function isRevoked() { return __el_revoked === true; }

  try {
    console.log("[EtiquetaLive Seller][diagnóstico] order-watcher cargado", VERSION, location.href);
  } catch (_) {}

  const DEFAULT_CONFIG = {
    apiBase: API_BASE,
    maxVisibleOrders: 12,
    domScanIntervalMs: 5000,
    mutationDebounceMs: 1800,
    forceBackgroundPollIntervalMs: 60000,
    controlledRefreshAfterMs: 15000,
    controlledRefreshCooldownMs: 15000,
    enableControlledRefreshFallback: true
  };
  let remoteConfig = { ...DEFAULT_CONFIG };

  function cfg(key) {
    return remoteConfig?.[key] ?? DEFAULT_CONFIG[key];
  }

  function apiBase() {
    return String(cfg("apiBase") || API_BASE).replace(/\/+$/, "");
  }

  function loadRemoteConfig() {
    try {
      chrome.storage.local.get(["el_remote_config"], (r) => {
        if (r.el_remote_config && typeof r.el_remote_config === "object") {
          remoteConfig = { ...DEFAULT_CONFIG, ...r.el_remote_config };
        }
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.el_remote_config?.newValue) {
          remoteConfig = { ...DEFAULT_CONFIG, ...changes.el_remote_config.newValue };
        }
      });
    } catch (_) {}
  }

  async function signRequest(body, apiKey) {
    // HMAC-SHA256 real usando la propia API key del tenant como clave —
    // sustituye el hash de 32 bits + secreto placeholder que nunca se resolvía.
    const enc = new TextEncoder();
    const str = typeof body === 'string' ? body : JSON.stringify(body || {});
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(apiKey || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(str));
    return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let lastSig = "";
  let scanTimer = null;
  let scanning = false;
  let lastScanAt = 0;
  let lastChangeAt = Date.now();
  let lastBackgroundSyncAt = 0;
  let cronoReconcileUntil = 0;
  let sessionState = { active: false, startedAt: 0, stats: { detected: 0, printed: 0 }, detectedIds: [], printedIds: [], ignoredIds: [], baselineDone: false, autoPrintEnabled: true, sellerRefreshMs: 15000 };

  function loadSessionState(cb) {
    try {
      chrome.storage.local.get(["el_print_session_active", "el_print_session_started_at", "el_print_session_stats", "el_print_session_detected_ids", "el_print_session_printed_ids", "el_print_session_ignored_ids", "el_print_session_baseline_done", "el_auto_print_enabled", "el_seller_refresh_ms"], (r) => {
        sessionState = {
          active: Boolean(r.el_print_session_active),
          startedAt: Number(r.el_print_session_started_at || 0),
          stats: r.el_print_session_stats || { detected: 0, printed: 0 },
          detectedIds: Array.isArray(r.el_print_session_detected_ids) ? r.el_print_session_detected_ids : [],
          printedIds: Array.isArray(r.el_print_session_printed_ids) ? r.el_print_session_printed_ids : [],
          ignoredIds: Array.isArray(r.el_print_session_ignored_ids) ? r.el_print_session_ignored_ids : [],
          baselineDone: Boolean(r.el_print_session_baseline_done),
          autoPrintEnabled: r.el_auto_print_enabled !== false,
          sellerRefreshMs: Math.max(15000, Math.min(300000, Number(r.el_seller_refresh_ms || 15000)))
        };
        if (cb) cb(sessionState);
      });
    } catch (_) { if (cb) cb(sessionState); }
  }

  function saveSessionCounters() {
    try {
      chrome.storage.local.set({
        el_print_session_stats: sessionState.stats,
        el_print_session_detected_ids: sessionState.detectedIds.slice(-250),
        el_print_session_printed_ids: sessionState.printedIds.slice(-250),
        el_print_session_ignored_ids: sessionState.ignoredIds.slice(-250),
        el_print_session_baseline_done: Boolean(sessionState.baselineDone)
      });
    } catch (_) {}
  }

  function parseOrderDateMs(value) {
    const s = String(value || "").trim();
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) {
      let a = Number(m[1]), b = Number(m[2]);
      let day = a, month = b;
      if (b > 12 && a <= 12) { day = b; month = a; }
      return new Date(Number(m[3]), month - 1, day, Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0)).getTime();
    }
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : 0;
  }

  function belongsToActivePrintSession(parsed) {
    if (!sessionState.active || !sessionState.startedAt || !parsed?.orderId) return false;
    const orderMs = parseOrderDateMs(parsed.orderDate);
    if (!orderMs) return false;
    const now = Date.now();
    // En Live, Seller puede mostrar el pedido 1-5 min después de que se creó en TikTok.
    // Permitimos una ventana de 10 min antes de pulsar Live para no perder ganadores recientes,
    // pero seguimos evitando imprimir pedidos antiguos visibles de horas/días anteriores.
    return orderMs >= sessionState.startedAt - (10 * 60 * 1000) && orderMs <= now + (5 * 60 * 1000);
  }

  function countSessionDetected(orderId) {
    if (!orderId || sessionState.detectedIds.includes(orderId)) return;
    sessionState.detectedIds.push(orderId);
    sessionState.stats.detected = Number(sessionState.stats.detected || 0) + 1;
    saveSessionCounters();
  }

  function countSessionPrinted(orderId) {
    if (!orderId || sessionState.printedIds.includes(orderId)) return;
    sessionState.printedIds.push(orderId);
    sessionState.stats.printed = Number(sessionState.stats.printed || 0) + 1;
    saveSessionCounters();
  }
  function installOrderApiHook() {
    try {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("order-api-hook.js");
      script.async = false;
      script.onload = () => script.remove();
      (document.documentElement || document.head || document.body).appendChild(script);
    } catch (_) {}
  }
  function sendRuntimeMessage(message) {
    try {
      if (!chrome?.runtime?.id) return;
      chrome.runtime.sendMessage(message, () => void chrome.runtime.lastError);
    } catch (_) {}
  }

  function hasCronoReconcileGate() {
    return Date.now() < Number(cronoReconcileUntil || 0);
  }

  function loadCronoReconcileGate(cb) {
    try {
      chrome.storage.local.get(["el_crono_reconcile_until", "el_crono_reconcile_attempt"], (r) => {
        cronoReconcileUntil = Number(r.el_crono_reconcile_until || 0);
        if (cb) cb({ until: cronoReconcileUntil, attempt: Number(r.el_crono_reconcile_attempt || 0) });
      });
    } catch (_) {
      if (cb) cb({ until: cronoReconcileUntil, attempt: 0 });
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== "EL_TIKTOK_ORDER_REQUEST") return;
    sendRuntimeMessage({ type: "EL_TIKTOK_ORDER_REQUEST", request: event.data.request });
  });

  function scheduleSellerRefresh(reason, event, delayMs = 900) {
    if (!/seller-es\.tiktok\.com\/order/i.test(location.href)) return;
    const existing = Number(sessionStorage.getItem("el_seller_refresh_due_at") || 0);
    const dueAt = Date.now() + Math.max(0, delayMs);
    if (existing && existing <= dueAt) return;
    sessionStorage.setItem("el_seller_refresh_due_at", String(dueAt));
    sessionStorage.setItem("el_seller_refresh_reason", reason || "scheduled_refresh");
    if (event) sessionStorage.setItem("el_last_auction_winner_event", JSON.stringify({ at: Date.now(), event }).slice(0, 4000));
    setTimeout(() => {
      const target = Number(sessionStorage.getItem("el_seller_refresh_due_at") || 0);
      if (!target || Date.now() < target - 250) return;
      sessionStorage.removeItem("el_seller_refresh_due_at");
      sessionStorage.setItem("el_last_seller_reload", String(Date.now()));
      post("/api/live/ping", { version: VERSION, reason: reason || "scheduled_refresh", event: event || {}, href: location.href, at: new Date().toISOString() });
      location.reload();
    }, Math.max(0, delayMs));
  }

  function refreshSellerAfterAuctionWinner(event) {
    if (!/seller-es\.tiktok\.com\/order/i.test(location.href)) return;
    const now = Date.now();
    const ev = event || {};
    const detectedAt = Date.parse(ev.detectedAt || ev.meta?.detectedAt || '') || now;
    if (Math.abs(now - detectedAt) > 120000) {
      scheduleScan("auction_winner_old_event_ignored");
      return;
    }
    const sig = [ev.winner || '', ev.price || '', ev.auctionId || '', ev.raw || ''].join('|').toLowerCase().slice(0, 500);
    const lastSig = sessionStorage.getItem("el_last_auction_winner_sig") || "";
    if (sig && sig === lastSig) {
      scheduleScan("auction_winner_duplicate_ignored");
      return;
    }
    sessionStorage.setItem("el_last_auction_winner_sig", sig);
    const lastReload = Number(sessionStorage.getItem("el_last_seller_reload") || sessionStorage.getItem("el_last_auction_winner_reload") || 0);
    const wait = Math.max(900, 60000 - (now - lastReload));
    scheduleSellerRefresh("auction_winner_refresh_seller", ev, wait);
  }

  function reconcileSellerAfterCronoZero(event) {
    if (!/seller-es\.tiktok\.com\/order/i.test(location.href)) return;
    const ev = event || {};
    const attempt = Math.max(1, Math.min(4, Number(ev.attempt || 1)));
    try {
      console.log("[EtiquetaLive Seller][diagnóstico] Reconcile recibido", "attempt", attempt, "event", ev);
    } catch (_) {}
    cronoReconcileUntil = Date.now() + 15000;
    lastChangeAt = Date.now();
    scan("crono_zero_reconcile_" + attempt + "_immediate");
    setTimeout(() => scan("crono_zero_reconcile_" + attempt + "_postload_1200"), 1200);
    setTimeout(() => scan("crono_zero_reconcile_" + attempt + "_postload_3000"), 3000);
    setTimeout(() => scan("crono_zero_reconcile_" + attempt + "_postload_6000"), 6000);
  }

  chrome.runtime?.onMessage?.addListener?.((message) => {
    try {
      console.log("[EtiquetaLive Seller][diagnóstico] runtime message", message?.type || "(sin type)", message);
    } catch (_) {}
    if (message?.type === "EL_BACKGROUND_SYNC_OK") {
      lastBackgroundSyncAt = Date.now();
      lastChangeAt = Date.now();
    }
    if (message?.type === "EL_SESSION_CHANGED") { loadSessionState(); }
    if (message?.type === "EL_AUCTION_WINNER_DETECTED") {
      lastChangeAt = Date.now();
      refreshSellerAfterAuctionWinner(message.event || {});
    }
    if (message?.type === "EL_AUCTION_CRONO_RECONCILE") {
      reconcileSellerAfterCronoZero(message.event || {});
    }
  });

  installOrderApiHook();

  function getApiKey() {
    return new Promise(resolve => {
      try { chrome.storage.local.get(["el_api_key"], r => resolve(r.el_api_key || "")); }
      catch(e) { resolve(""); }
    });
  }

  function priceToNumber(price) {
    const m = String(price || "").match(/(\d{1,6}(?:[,.]\d{1,2})?)/);
    return m ? Number(m[1].replace(',', '.')) : 0;
  }

  function normalizeOrderDate(dateText) {
    const s = norm(dateText || "");
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?)?/);
    if (m) {
      let a = Number(m[1]), b = Number(m[2]);
      // TikTok/API a veces devuelve MM/DD/YYYY. Si el segundo número >12, giramos a DD/MM/YYYY.
      let day = a, month = b;
      if (b > 12 && a <= 12) { day = b; month = a; }
      const now = new Date();
      const hh = String(m[4] || now.getHours()).padStart(2, '0');
      const mm = String(m[5] || now.getMinutes()).padStart(2, '0');
      return `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${m[3]} ${hh}:${mm}`;
    }
    const d = new Date(s);
    const safe = Number.isNaN(d.getTime()) ? new Date() : d;
    return safe.toLocaleString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false });
  }

  function parseOrderDateMs(dateText) {
    const s = normalizeOrderDate(dateText);
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0)).getTime();
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }

  function shouldAutoPrint(parsed) {
    return sessionState.autoPrintEnabled !== false && belongsToActivePrintSession(parsed);
  }

  async function postDetectedOrder(path, data) {
    const apiKey = await getApiKey();
    if (!apiKey) return null;
    const body = JSON.stringify(data);
    try {
      const resp = await fetch(apiBase() + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "x-el-sign": await signRequest(body, apiKey)
        },
        body
      });
      return await resp.json().catch(() => null);
    } catch (_) { return null; }
  }

  async function markPrintApi(tk, action) {
    if (!tk) return null;
    return postDetectedOrder(`/api/v1/orders/${encodeURIComponent(tk)}/mark-print-api`, { action: action || "extension_print_invoked" });
  }

  function waitForImagesAndPrint(win, cleanup, tk) {
    let cleaned = false;
    const runCleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try { if (cleanup) cleanup(); } catch(e) {}
    };
    try { win.addEventListener('afterprint', () => setTimeout(runCleanup, 350), { once: true }); } catch(e) {}
    const doPrint = async () => {
      try { await markPrintApi(tk, "extension_before_print"); } catch(e) {}
      try { win.focus(); win.print(); } catch(e) {}
      setTimeout(runCleanup, 12000);
    };
    try {
      const doc = win.document;
      const imgs = Array.from(doc.images || []);
      const qrImgs = imgs.filter(img => /qr|codigo|c[oó]digo|data:image/i.test((img.src || '') + ' ' + (img.alt || '') + ' ' + (img.className || '')));
      const targets = qrImgs.length ? qrImgs : imgs;
      if (!targets.length) return setTimeout(doPrint, 900);
      let pending = targets.length;
      const done = () => { if (--pending <= 0) setTimeout(doPrint, 250); };
      const timeout = setTimeout(doPrint, 3500);
      targets.forEach(img => {
        if (img.complete && img.naturalWidth > 0) return done();
        img.addEventListener('load', () => { clearTimeout(timeout); done(); }, { once: true });
        img.addEventListener('error', () => { clearTimeout(timeout); done(); }, { once: true });
      });
    } catch (_) { setTimeout(doPrint, 1200); }
  }

  function printLabel(labelHtml, tk) {
    if (!labelHtml) return;
    try {
      const w = window.open('', '_blank', 'width=420,height=320');
      if (w) {
        w.document.open();
        w.document.write(labelHtml);
        w.document.close();
        waitForImagesAndPrint(w, () => { try { w.close(); } catch(e) {} }, tk);
        return;
      }
    } catch(e) {}

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(labelHtml);
    iframe.contentDocument.close();
    waitForImagesAndPrint(iframe.contentWindow, () => iframe.remove(), tk);
  }

  function rememberIgnored(orderId) {
    if (!orderId || sessionState.ignoredIds.includes(orderId)) return;
    sessionState.ignoredIds.push(orderId);
    saveSessionCounters();
  }

  async function detectOnly(c) {
    const p = c.parsed;
    if (!p?.orderId) return;
    await postDetectedOrder("/api/v1/order/detect", {
      order_id: p.orderId, cliente: p.customer || "", precio: priceToNumber(p.price), moneda: "EUR",
      fecha_pedido: normalizeOrderDate(p.orderDate), raw: c.raw || "", detect_only: true
    });
    countSessionDetected(p.orderId);
  }

  async function sendDetectedOrders(cards) {
    const valid = cards.filter(c => c.parsed?.orderId && c.hasSubasta);

    // Al iniciar Live, TikTok muestra pedidos antiguos. Solo usamos los 2 primeros como referencia,
    // los detectamos sin imprimir, e ignoramos el resto de visibles para que no salten etiquetas antiguas.
    if (sessionState.active && !sessionState.baselineDone) {
      const baseline = valid.slice(0, 2);
      const ignored = valid.slice(2);
      for (const c of baseline) await detectOnly(c);
      for (const c of ignored) rememberIgnored(c.parsed.orderId);
      sessionState.baselineDone = true;
      saveSessionCounters();
      return;
    }

    for (const c of valid) {
      const p = c.parsed;
      if (sessionState.detectedIds.includes(p.orderId) || sessionState.ignoredIds.includes(p.orderId) || sessionState.printedIds.includes(p.orderId)) continue;
      const autoPrint = shouldAutoPrint(p);
      const result = await postDetectedOrder("/api/v1/order/detect", {
        order_id: p.orderId,
        cliente: p.customer || "",
        precio: priceToNumber(p.price),
        moneda: "EUR",
        fecha_pedido: normalizeOrderDate(p.orderDate),
        raw: c.raw || ""
      });
      countSessionDetected(p.orderId);
      if (result?.label_html && autoPrint) {
        printLabel(result.label_html, result.tk);
        countSessionPrinted(p.orderId);
      }
    }
  }

  function norm(s) {
    return String(s || "")
      .replace(/\u00a0/g, " ")
      .replace(/[\t\r]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    // No escanear elementos lejísimos fuera de pantalla. Reduce mucho la carga.
    if (r.bottom < -250 || r.top > window.innerHeight + 900) return false;
    const st = getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden" && st.opacity !== "0";
  }

  async function post(path, data) {
    const body = JSON.stringify(data);
    const apiKey = await getApiKey();
    fetch(apiBase() + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-el-sign": await signRequest(body, apiKey),
        ...(apiKey ? { "x-api-key": apiKey } : {})
      },
      body: body
    }).catch(() => {});
  }

  function textLines(text) {
    return String(text || "")
      .split(/\n+/)
      .map(norm)
      .filter(Boolean);
  }

  function getText(el) {
    return norm(el?.innerText || el?.textContent || "");
  }

  function findOrderHeaderElements() {
    // Escaneo reducido: buscamos texto visible que contenga ID de pedido o Subasta + ID.
    // Sigue usando DOM visible porque TikTok cambia clases, pero limita elementos y tamaño.
    const out = [];
    const all = Array.from(document.querySelectorAll("body *"));
    for (const el of all) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 160 || r.height > 160) continue;
      const txt = getText(el);
      if (!txt || txt.length > 450) continue;
      const hasOrder = /ID\s*de\s*pedido\s*:?\s*\d{12,}/i.test(txt) || (/\b\d{15,}\b/.test(txt) && /\bSubasta\b/i.test(txt));
      if (hasOrder) out.push(el);
    }
    return out;
  }

  function uniqueHeaders(headers) {
    const rows = [];
    for (const h of headers) {
      const txt = getText(h);
      const orderId = (txt.match(/(?:ID\s*de\s*pedido\s*:?)?\s*(\d{15,})/i) || [])[1];
      if (!orderId) continue;
      const r = h.getBoundingClientRect();
      rows.push({ el: h, orderId, rect: r });
    }
    rows.sort((a,b) => a.rect.top - b.rect.top);
    const byOrder = new Map();
    for (const row of rows) {
      const prev = byOrder.get(row.orderId);
      if (!prev || row.rect.width > prev.rect.width) byOrder.set(row.orderId, row);
    }
    return Array.from(byOrder.values())
      .sort((a,b) => a.rect.top - b.rect.top)
      .slice(0, Number(cfg("maxVisibleOrders")) || 12);
  }

  function nearestCardContainer(anchorEl, orderId) {
    let best = anchorEl;
    let cur = anchorEl;
    for (let depth = 0; cur && depth < 9; depth++, cur = cur.parentElement) {
      if (!visible(cur)) continue;
      const r = cur.getBoundingClientRect();
      const t = getText(cur);
      if (!t.includes(orderId)) continue;
      if (r.width < 500 || r.height < 35) continue;
      if (r.height > 390 || r.width > window.innerWidth * 0.985) continue;
      best = cur;
      if (/Crear\s+etiqueta|Crear\s+e\s+imprimir|Pendiente\s+de\s+env[ií]o|Tarjeta|Apple\s+Pay|Paypal|Env[ií]o\s+est[aá]ndar|\d{1,6}(?:[,.]\d{1,2})?\s*€/i.test(t)) {
        return cur;
      }
    }
    return best;
  }

  function collectRowText(anchorEl, nextTop, orderId) {
    const cardEl = nearestCardContainer(anchorEl, orderId);
    const cr = cardEl.getBoundingClientRect();
    const ar = anchorEl.getBoundingClientRect();

    const yMin = Math.max(0, Math.min(cr.top, ar.top) - 10);
    const naturalMax = Math.max(cr.bottom, ar.top + 235);
    const yMax = Number.isFinite(nextTop) ? Math.min(naturalMax, nextTop - 3) : naturalMax;

    const nodes = [];
    const seenEls = new Set();
    function addNode(el, force=false) {
      if (!el || seenEls.has(el) || !visible(el)) return;
      seenEls.add(el);
      const r = el.getBoundingClientRect();
      if (!force) {
        if (r.top < yMin || r.top > yMax) return;
        if (r.right < 180 || r.left > window.innerWidth - 20) return;
      }
      const t = getText(el);
      if (!t || t.length > 1800) return;
      if (r.width > window.innerWidth * 0.95 && t.length > 700) return;
      nodes.push({ t, top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), force });
    }

    // 1) Texto del contenedor principal.
    addNode(cardEl, true);

    // 2) Hijos directos e internos de la tarjeta, sin recorrer toda la página.
    for (const el of Array.from(cardEl.querySelectorAll("*"))) addNode(el, true);

    // 3) Fallback ligero: solo nodos visibles cercanos si el contenedor no tenía precio.
    const joinedLocal = nodes.map(n => n.t).join(" ");
    if (!/\d{1,6}(?:[,.]\d{1,2})?\s*€/.test(joinedLocal)) {
      const all = Array.from(document.querySelectorAll("body *"));
      for (const el of all) {
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.top < yMin || r.top > yMax) continue;
        if (r.right < 180 || r.left > window.innerWidth - 20) continue;
        const t = getText(el);
        if (!/\d{1,6}(?:[,.]\d{1,2})?\s*€|Tarjeta|Apple\s+Pay|Paypal|cr[eé]dito|d[eé]bito/i.test(t)) continue;
        addNode(el, false);
      }
    }

    nodes.sort((a,b) => (a.top - b.top) || (a.left - b.left) || (a.w - b.w));

    const seen = new Set();
    const lines = [];
    for (const n of nodes) {
      for (const l of textLines(n.t)) {
        if (!l || l.length > 320) continue;
        if (!seen.has(l)) { seen.add(l); lines.push(l); }
      }
    }
    return { lines, raw: lines.join(" | "), cardRect: { left: Math.round(cr.left), top: Math.round(cr.top), width: Math.round(cr.width), height: Math.round(cr.height) } };
  }

  function parseCard(lines, raw) {
    const joined = norm(raw || lines.join(" "));
    const orderId = (joined.match(/(?:ID\s*de\s*pedido\s*:?)?\s*(\d{15,})/i) || [])[1] || "";
    const hasSubasta = /\bSubasta\b/i.test(joined);
    if (!orderId || !hasSubasta) return null;

    let customer = "";
    const idxSub = lines.findIndex(l => /^Subasta$/i.test(l) || /\bSubasta\b/i.test(l));
    if (idxSub >= 0) {
      for (let i = idxSub + 1; i < Math.min(lines.length, idxSub + 16); i++) {
        const l = lines[i];
        if (!l || /Iniciar chat/i.test(l) || /^España$/i.test(l) || /^Subasta$/i.test(l)) continue;
        if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(l)) continue;
        if (/^\d{1,6}(?:[,.]\d{1,2})?\s*€$/.test(l)) continue;
        if (/ID\s*de\s*pedido/i.test(l) || /^\d{15,}$/.test(l)) continue;
        if (/Pendiente|Env[ií]o|Tarjeta|Apple\s+Pay|Paypal|cr[eé]dito|d[eé]bito|Creador|producto|Caja|Crear|M[aá]s acciones/i.test(l)) continue;
        customer = l;
        break;
      }
    }
    if (!customer) {
      const m = joined.match(/Subasta\s+(.+?)\s+Iniciar\s+chat/i);
      if (m) customer = norm(m[1]);
    }

    const date = (joined.match(/(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?)/) || [])[1] || "";

    let price = "";
    const badPriceContext = /GMV|Comisi[oó]n|espectadores|ventas|art[ií]culos|Resumen|Cancelaci[oó]n|reembolso|env[ií]o\s+en\s+24/i;
    const priceCandidates = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const matches = Array.from(l.matchAll(/(?:^|\s)(\d{1,6}(?:[,.]\d{1,2})?\s*€)(?:\s|$)/g)).map(m => m[1]);
      for (const p of matches) {
        const context = [lines[i-4], lines[i-3], lines[i-2], lines[i-1], lines[i], lines[i+1], lines[i+2], lines[i+3], lines[i+4]].filter(Boolean).join(" ");
        if (badPriceContext.test(context)) continue;
        let score = 1;
        if (/Tarjeta|cr[eé]dito|d[eé]bito|Apple\s+Pay|Paypal/i.test(context)) score += 20;
        if (/Pendiente\s+de\s+env[ií]o|Env[ií]o\s+est[aá]ndar/i.test(context)) score += 5;
        if (/Subasta/i.test(context)) score += 2;
        priceCandidates.push({ value: p, score, context });
      }
    }
    if (priceCandidates.length) {
      priceCandidates.sort((a,b) => b.score - a.score);
      price = priceCandidates[0].value;
    }

    const complete = Boolean(orderId && customer && date && price);
    return { orderId, customer, price, orderDate: date, type: "Subasta", complete };
  }

  function scan(reason) {
    if (isRevoked()) return;
    if (!/seller-es\.tiktok\.com\/order/i.test(location.href)) return;
    if (!hasCronoReconcileGate() && !String(reason || "").startsWith("crono_zero_reconcile_")) return;
    if (scanning) return;
    const now = Date.now();
    if (reason === "mutation" && now - lastScanAt < (Number(cfg("mutationDebounceMs")) || 1800)) return;
    scanning = true;
    lastScanAt = now;
    try {
      const headers = uniqueHeaders(findOrderHeaderElements());
      const cards = [];
      for (let i = 0; i < headers.length; i++) {
        const h = headers[i].el;
        const nextTop = headers[i+1]?.rect?.top;
        const row = collectRowText(h, nextTop, headers[i].orderId);
        const raw = row.raw;
        const orderId = (raw.match(/(?:ID\s*de\s*pedido\s*:?)?\s*(\d{15,})/i) || [])[1] || headers[i].orderId;
        if (!orderId) continue;
        const hasSubasta = /\bSubasta\b/i.test(raw);
        const parsed = parseCard(row.lines, raw);
        const rect = h.getBoundingClientRect();
        cards.push({
          orderNumber: orderId,
          hasSubasta,
          parsed,
          raw,
          lines: row.lines,
          cardRect: row.cardRect,
          rect: { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) }
        });
      }
      cards.sort((a,b) => a.rect.top - b.rect.top);
      const sig = cards.map(c => `${c.orderNumber}:${c.hasSubasta}:${c.parsed?.complete ? 'Parsed' : 'NoParsed'}:${c.parsed?.price || ''}:${c.parsed?.customer || ''}`).join("|");
      if (sig && sig !== lastSig) {
        lastSig = sig;
        lastChangeAt = Date.now();
        post("/api/orders/scan", { version: VERSION, reason, href: location.href, capturedAt: new Date().toISOString(), count: cards.length, cards });
        sendDetectedOrders(cards);
      }
    } finally {
      scanning = false;
    }
  }

  function scheduleScan(reason) {
    if (!hasCronoReconcileGate() && !String(reason || "").startsWith("crono_zero_reconcile_")) return;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => scan(reason), Number(cfg("mutationDebounceMs")) || 1800);
  }

  function controlledRefreshFallback() {
    // Refresco suave periódico de Seller Orders: máximo 1 vez cada 60s desde la última recarga.
    if (!cfg("enableControlledRefreshFallback")) return;
    if (!/seller-es\.tiktok\.com\/order/i.test(location.href)) return;
    const now = Date.now();
    const lastReload = Number(sessionStorage.getItem("el_last_seller_reload") || sessionStorage.getItem("el_last_controlled_reload") || 0);
    const refreshMs = Math.max(15000, Math.min(300000, Number(sessionState.sellerRefreshMs || cfg("controlledRefreshCooldownMs") || 15000)));
    if (lastReload && now - lastReload < refreshMs) return;
    scheduleSellerRefresh("seller_periodic_60s_refresh", {}, 900);
  }

  const start = () => {
    loadSessionState();
    loadRemoteConfig();
    loadSessionState();
    loadCronoReconcileGate((gate) => {
      if (gate.until && Date.now() < gate.until) {
        const attempt = Math.max(1, Math.min(4, Number(gate.attempt || 1)));
        scan("crono_zero_reconcile_" + attempt + "_load");
        setTimeout(() => scan("crono_zero_reconcile_" + attempt + "_postload_1200"), 1200);
        setTimeout(() => scan("crono_zero_reconcile_" + attempt + "_postload_3000"), 3000);
        setTimeout(() => scan("crono_zero_reconcile_" + attempt + "_postload_6000"), 6000);
      }
    });
    const obs = new MutationObserver(() => scheduleScan("mutation"));
    obs.observe(document.documentElement || document.body, { childList: true, subtree: true, characterData: true });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
