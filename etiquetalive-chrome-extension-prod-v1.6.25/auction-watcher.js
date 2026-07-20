(() => {
  const VERSION = "el-1.6.25-auction";
  const API_BASE = "https://etiquetalivetiktok.satecnic.es";
  const SCAN_INTERVAL_MS = 2500;
  const MUTATION_DEBOUNCE_MS = 1000;
  const EVENT_COOLDOWN_MS = 15000;

  let lastSig = "";
  let lastEventAt = 0;
  let scanTimer = null;
  let scanning = false;

  async function signRequest(body, apiKey) {
    // HMAC-SHA256 real usando la propia API key del tenant como clave.
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

  function apiBase() { return API_BASE.replace(/\/+$/, ""); }
  function norm(s) { return String(s || "").replace(/\u00a0/g, " ").replace(/[\t\r]+/g, " ").replace(/\s+/g, " ").trim(); }

  // Al quitar/actualizar la extensi\u00f3n, esta pesta\u00f1a (si ya estaba abierta) se
  // queda con el content script "zombi": el crono se sigue viendo, pero ya no
  // puede avisar a la extensi\u00f3n del ganador (chrome.runtime.id deja de
  // existir) \u2014 antes fallaba en silencio y solo se arreglaba con F5 a ciegas.
  let extensionContextBannerShown = false;
  function isExtensionContextValid() {
    try { return Boolean(chrome && chrome.runtime && chrome.runtime.id); } catch (_) { return false; }
  }
  function checkExtensionContext() {
    if (isExtensionContextValid() || extensionContextBannerShown) return;
    extensionContextBannerShown = true;
    try {
      const el = document.createElement("div");
      el.style.cssText = "position:fixed;top:12px;right:12px;z-index:2147483647;background:#7f1d1d;color:#fff;padding:10px 14px;border-radius:8px;font:600 13px/1.4 sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.3);max-width:360px;display:flex;align-items:center;gap:10px;";
      const text = document.createElement("span");
      text.textContent = "\u26a0\ufe0f La extensi\u00f3n EtiquetaLive se ha actualizado. Recarga esta p\u00e1gina para seguir detectando ganadores.";
      const btn = document.createElement("button");
      btn.textContent = "Recargar";
      btn.style.cssText = "background:#fff;color:#7f1d1d;border:0;border-radius:6px;padding:6px 10px;font:700 12px sans-serif;cursor:pointer;flex-shrink:0;";
      btn.onclick = () => location.reload();
      el.appendChild(text);
      el.appendChild(btn);
      document.body.appendChild(el);
    } catch (_) {}
  }

  function installAuctionApiHook() {
    try {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("auction-api-hook.js");
      script.async = false;
      script.onload = () => script.remove();
      (document.documentElement || document.head || document.body).appendChild(script);
    } catch (_) {}
  }

  function getApiKey() {
    return new Promise(resolve => {
      try { chrome.storage.local.get(["el_api_key"], r => resolve(r.el_api_key || "")); }
      catch(e) { resolve(""); }
    });
  }

  function sendRuntimeMessage(message) {
    try {
      if (!chrome?.runtime?.id) return;
      chrome.runtime.sendMessage(message, () => void chrome.runtime.lastError);
    } catch (_) {}
  }

  async function postAuctionEvent(event) {
    const apiKey = await getApiKey();
    if (!apiKey) return; // sin clave configurada todavía, el servidor la rechazaría igualmente
    const body = JSON.stringify({ version: VERSION, event });
    try {
      await fetch(apiBase() + "/api/auction/event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-el-sign": await signRequest(body, apiKey),
          "x-api-key": apiKey
        },
        body
      });
    } catch (_) {}
  }

  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    if (r.bottom < -400 || r.top > window.innerHeight + 1200) return false;
    const st = getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden" && st.opacity !== "0";
  }

  function getText(el) { return norm(el?.innerText || el?.textContent || ""); }

  function extractPrice(text) {
    const s = String(text || "");
    // Actividad TikTok: "Rosa Granado Arroyo ha ganado el artículo de la subasta 4 €"
    let m = s.match(/[\p{L}\p{N}_.@\- ]{2,80}\s+ha\s+ganado\s+el\s+art[ií]culo\s+de\s+la\s+subasta[^0-9]{0,40}(\d{1,6}(?:[,.]\d{1,2})?)\s*(?:€|EUR)?/iu);
    if (m?.[1]) return norm(m[1]);
    // Formato real: "Ganador de esta ronda: silvy_883 : 2€"
    m = s.match(/ganador(?:a)?\s+de\s+esta\s+ronda\s*[:：-]\s*@?[\p{L}\p{N}_.\-]{2,60}\s*[:：-]\s*(\d{1,6}(?:[,.]\d{1,2})?)\s*(?:€|EUR)?/iu);
    if (m?.[1]) return norm(m[1]);
    m = s.match(/(?:€|EUR|price|precio|importe|final|winning|ganad[oa])[^0-9]{0,30}(\d{1,6}(?:[,.]\d{1,2})?)|(?:^|\s)(\d{1,6}(?:[,.]\d{1,2})?)\s*(?:€|EUR)/i);
    return norm((m && (m[1] || m[2])) || "");
  }

  function extractWinner(text) {
    const s = String(text || "");
    // Actividad TikTok: "Rosa Granado Arroyo ha ganado el artículo de la subasta 4 €"
    let m = s.match(/(?:^|\|)\s*([\p{L}\p{N}_.@\- ]{2,80}?)\s+ha\s+ganado\s+el\s+art[ií]culo\s+de\s+la\s+subasta/iu) || s.match(/^\s*([\p{L}\p{N}_.@\- ]{2,80}?)\s+ha\s+ganado\s+el\s+art[ií]culo\s+de\s+la\s+subasta/iu);
    if (m?.[1]) return norm(m[1]).replace(/^Actividad\s+/i, '').slice(0, 80);
    // Formato real TikTok Live: "Ganador de esta ronda: silvy_883 : 2€"
    m = s.match(/ganador(?:a)?\s+de\s+esta\s+ronda\s*[:：-]\s*(@?[\p{L}\p{N}_.\-]{2,60})\s*(?::|€|EUR|$)/iu);
    if (m?.[1]) return norm(m[1]).slice(0, 80);

    const patterns = [
      /(?:ganador|ganadora|winner|won by|comprador|buyer|usuario)\s*[:：-]\s*(@?[\p{L}\p{N}_.\-]{2,60})/iu,
      /(@[\p{L}\p{N}_.\-]{2,40})/iu
    ];
    for (const re of patterns) {
      m = s.match(re);
      if (m?.[1]) {
        const value = norm(m[1]).replace(/\s+(precio|price|producto|product|pedido|order|hora|time).*$/i, "").trim();
        if (value && !/ganador|winner|buyer|comprador|ronda/i.test(value)) return value.slice(0, 80);
      }
    }
    return "";
  }

  function extractProductName(lines, text) {
    const bad = /(ganador|winner|comprador|buyer|precio|price|subasta|auction|finalizada|ended|pedido|order|crear|acciones|dashboard)/i;
    for (const line of lines) {
      const l = norm(line);
      if (l.length < 4 || l.length > 120) continue;
      if (bad.test(l)) continue;
      if (/^@?[\w.\-]{2,40}$/.test(l)) continue;
      if (/\d{1,6}(?:[,.]\d{1,2})?\s*(€|EUR)/i.test(l)) continue;
      return l;
    }
    const m = String(text || "").match(/(?:producto|product)\s*[:：-]?\s*(.{4,120})/i);
    return norm(m?.[1] || "").slice(0, 120);
  }

  function candidateBlocksFromDom() {
    const out = [];
    const nodes = Array.from(document.querySelectorAll("body *"));
    for (const el of nodes) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 180 || r.height < 24 || r.height > 520) continue;
      const txt = getText(el);
      if (!txt || txt.length < 12 || txt.length > 2500) continue;
      if (!/(ganador|ganadora|ganado|ha\s+ganado|winner|won|comprador|buyer|subasta finalizada|auction ended|@)/i.test(txt)) continue;
      if (!/(subasta|auction|ganador|ganado|ha\s+ganado|winner|won|comprador|buyer)/i.test(txt)) continue;
      out.push({ el, txt, top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) });
    }
    out.sort((a,b) => (a.top - b.top) || (a.left - b.left));
    return out.slice(0, 20);
  }


  function buildActivityEventsFromText(raw, source, meta = {}) {
    const text = norm(raw);
    const events = [];
    const re = /([\p{L}\p{N}_.@\- ]{2,80}?)\s+ha\s+ganado\s+el\s+art[ií]culo\s+de\s+la\s+subasta[^0-9]{0,40}(\d{1,6}(?:[,.]\d{1,2})?)\s*(?:€|EUR)?/giu;
    let m;
    while ((m = re.exec(text))) {
      const winner = norm(m[1]).replace(/^Actividad\s+/i, '').replace(/.*\b(Actividad)\b\s*/i, '').trim();
      const price = norm(m[2]);
      if (!winner || /cliente\s+ha\s+comprado/i.test(winner)) continue;
      events.push({
        source,
        winner: winner.slice(0, 80),
        productName: '',
        price,
        auctionId: '',
        raw: m[0].slice(0, 1000),
        pageUrl: location.href,
        title: document.title,
        detectedAt: new Date().toISOString(),
        meta: { ...meta, parser: 'activity_winner_line' }
      });
    }
    return events;
  }

  function buildEventFromText(raw, source, meta = {}) {
    const text = norm(raw);
    const winner = extractWinner(text);
    if (!winner) return null;
    const lines = text.split(/\s{2,}|\|/).map(norm).filter(Boolean);
    const price = extractPrice(text);
    const productName = extractProductName(lines, text);
    const auctionId = (text.match(/\b\d{12,}\b/) || [])[0] || "";
    return {
      source,
      winner,
      productName,
      price,
      auctionId,
      raw: text.slice(0, 4000),
      pageUrl: location.href,
      title: document.title,
      detectedAt: new Date().toISOString(),
      meta
    };
  }

  function emitAuctionEvent(event) {
    const sig = [event.winner, event.productName, event.price, event.auctionId].join("|").toLowerCase();
    const now = Date.now();
    if (!sig || (sig === lastSig && now - lastEventAt < EVENT_COOLDOWN_MS)) return;
    lastSig = sig;
    lastEventAt = now;
    sendRuntimeMessage({ type: "EL_AUCTION_WINNER_DETECTED", event });
    postAuctionEvent(event);
  }

  function scanDom(reason = "tick") {
    if (!/shop\.tiktok\.com\/streamer\/live/i.test(location.href)) return;
    try { checkFinishedBanner(); } catch (_) {}
    try { checkWinnerLabel(); } catch (_) {}
    if (scanning) return;
    scanning = true;
    try {
      const blocks = candidateBlocksFromDom();
      for (const block of blocks) {
        const meta = { reason, rect: { top: block.top, left: block.left, width: block.width, height: block.height } };
        const activityEvents = buildActivityEventsFromText(block.txt, "auction_activity_dom", meta);
        if (activityEvents.length) {
          for (const event of activityEvents) emitAuctionEvent(event);
          continue;
        }
        const event = buildEventFromText(block.txt, "auction_dom", meta);
        if (event) emitAuctionEvent(event);
      }
    } finally { scanning = false; }
  }

  function scheduleScan(reason) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => scanDom(reason), MUTATION_DEBOUNCE_MS);
  }

  // ═══════════════════════════════════════════════════════════
  // Crono Watcher (detecta fin de subasta)
  //
  // Observa el cronómetro "Finaliza dentro de XX:XX" en TikTok Live.
  // Cuando llega a 00:00 → dispara un escaneo inmediato (con un margen
  // de unos segundos para que TikTok genere el pedido del ganador), en
  // vez de esperar al siguiente escaneo periódico (SCAN_INTERVAL_MS).
  // ═══════════════════════════════════════════════════════════
  const reconcileDelayMs = 6000;
  const CRONO_TRIGGER_KEYWORDS = ["Finaliza dentro de", "Ends in", "结束于", "Termina en"];

  // Aviso directo, compartido entre el crono llegando a 00:00 y la detección
  // del cartel "Subasta finalizada" (ver más abajo) — ambos son señales
  // independientes de que la ronda ha terminado, con su propio anti-rebote
  // compartido para no avisar dos veces por la misma ronda.
  let lastAuctionEndSignalAt = 0;
  function notifyAuctionEndedDirect(reason) {
    const now = Date.now();
    if (now - lastAuctionEndSignalAt < 8000) return;
    lastAuctionEndSignalAt = now;
    try {
      sendRuntimeMessage({
        type: "EL_AUCTION_WINNER_DETECTED",
        event: {
          source: reason,
          winner: "", productName: "", price: "", auctionId: "",
          raw: reason + "_" + now,
          pageUrl: location.href,
          title: document.title,
          detectedAt: new Date().toISOString(),
          meta: { reason }
        }
      });
    } catch (_) {}
  }

  // Al terminar la ronda, TikTok a veces no llega a mostrar nunca el texto
  // literal "00:00" del cronómetro — sustituye directamente el cronómetro por
  // un cartel de "Subasta finalizada" (visto en producción), saltándose el
  // estado que vigila el crono. Se vigila también ese cartel como señal
  // alternativa e independiente de fin de ronda.
  const FINISHED_BANNER_KEYWORDS = ["subasta finalizada", "auction ended", "auction finished", "auction has ended"];
  let lastFinishedBannerSeenAt = 0;
  function checkFinishedBanner() {
    if (!/shop\.tiktok\.com\/streamer\/live/i.test(location.href)) return;
    const now = Date.now();
    if (now - lastFinishedBannerSeenAt < 20000) return; // ya visto hace poco, no repetir por la misma ronda
    const text = norm(document.body?.innerText || "").toLowerCase();
    if (!FINISHED_BANNER_KEYWORDS.some((kw) => text.includes(kw))) return;
    lastFinishedBannerSeenAt = now;
    setTimeout(() => {
      notifyAuctionEndedDirect("finished_banner_direct");
      try { scanDom("finished_banner"); } catch (_) {}
    }, reconcileDelayMs);
  }

  // Señal más fiable que las dos de arriba: la tarjeta de la subasta siempre
  // tiene un bloque fijo "Ganador de esta ronda: --" (visto en producción),
  // que TikTok rellena con el nombre real en cuanto termina la ronda. A
  // diferencia del crono o de un cartel de texto libre, esta etiqueta no
  // desaparece nunca — solo cambia su valor — así que no depende de pillar
  // el instante exacto en que aparece/desaparece un elemento.
  let lastWinnerLabelValue = "";
  function checkWinnerLabel() {
    if (!/shop\.tiktok\.com\/streamer\/live/i.test(location.href)) return;
    try {
      const divs = document.querySelectorAll("div");
      for (const el of divs) {
        const txt = norm(el.textContent || "");
        if (txt.length > 80) continue; // descarta contenedores grandes que engloban más cosas
        const m = txt.match(/^Ganador de esta ronda\s*:\s*(.+)$/i) || txt.match(/^Winner of this round\s*:\s*(.+)$/i);
        if (!m) continue;
        const value = norm(m[1] || "");
        if (!value || value === "--" || value === "-" || /^-+$/.test(value)) {
          lastWinnerLabelValue = "";
          return;
        }
        if (value === lastWinnerLabelValue) return; // ya procesado este ganador
        lastWinnerLabelValue = value;
        notifyAuctionEndedDirect("winner_label_direct");
        emitAuctionEvent({
          source: "winner_label_dom",
          winner: value.slice(0, 80),
          productName: "",
          price: "",
          auctionId: "",
          raw: txt.slice(0, 500),
          pageUrl: location.href,
          title: document.title,
          detectedAt: new Date().toISOString(),
          meta: { reason: "winner_label_dom" }
        });
        return;
      }
    } catch (_) {}
  }

  class AuctionCronoWatcher {
    constructor() {
      this.cronoEl = null;
      this.observer = null;
      this.lastTrigger = 0;
      this.findInterval = null;
      this.attached = false;
      this.lastTickText = "";
    }

    start() {
      this.findCronoEl();
      this.findInterval = setInterval(() => {
        if (!this.cronoEl || !document.contains(this.cronoEl)) {
          this.attached = false;
          this.findCronoEl();
        }
      }, 3000);
    }

    findCronoEl() {
      // Antes se buscaba primero un DIV grande que contuviera "Finaliza
      // dentro de" y LUEGO un span con el formato de hora dentro de él —
      // en una página tan cargada como el panel de Seller ese primer paso
      // podía no dar con el div correcto (o dar con uno demasiado grande) y
      // se quedaba sin encontrar nunca el cronómetro. Se invierte el orden:
      // se busca directamente el span con formato HH:MM/MM:SS (más
      // específico y fiable) y solo después se confirma que está cerca del
      // texto "Finaliza dentro de" (subiendo unos pocos niveles de
      // ancestros), para no enganchar por error algún otro reloj/duración
      // que hubiera en la página.
      try {
        const spans = document.querySelectorAll("span");
        for (const sp of spans) {
          const txt = (sp.textContent || "").trim();
          if (!/^\d{1,2}:\d{2}$/.test(txt)) continue;

          let ctx = sp;
          let nearKeyword = false;
          for (let i = 0; i < 5 && ctx; i++) {
            const t = ctx.textContent || "";
            if (CRONO_TRIGGER_KEYWORDS.some((kw) => t.includes(kw))) { nearKeyword = true; break; }
            ctx = ctx.parentElement;
          }
          if (!nearKeyword) continue;

          this.attachObserver(sp);
          return;
        }
      } catch (_) {}
    }

    attachObserver(el) {
      if (el === this.cronoEl && this.attached) return;
      if (this.observer) {
        try { this.observer.disconnect(); } catch (_) {}
      }
      this.cronoEl = el;
      this.attached = true;
      this.observer = new MutationObserver(() => this.checkZero());
      this.observer.observe(el, { characterData: true, childList: true, subtree: true });
      this.checkZero();
    }

    checkZero() {
      if (!this.cronoEl) return;
      const txt = (this.cronoEl.textContent || "").trim();
      if (txt === "00:00" || txt === "0:00") this.onZero();
    }

    onZero() {
      const now = Date.now();
      if (now - this.lastTrigger < 8000) return; // anti-rebote
      this.lastTrigger = now;
      setTimeout(() => {
        // Aviso directo a Seller SIEMPRE que el crono llega a 00:00, sin
        // esperar a haber podido leer el texto del ganador en esta página
        // (ese parseo es frágil y depende de cómo TikTok lo muestre en cada
        // momento).
        notifyAuctionEndedDirect("crono_zero_direct");
        // Además se intenta seguir leyendo el texto del ganador (nombre,
        // precio) para el registro/forwarding en el backend — si no lo
        // encuentra, el aviso de arriba ya ha disparado la recarga igualmente.
        try { scanDom("crono_zero"); } catch (_) {}
      }, reconcileDelayMs);
    }

    stop() {
      if (this.observer) { try { this.observer.disconnect(); } catch (_) {} }
      if (this.findInterval) { try { clearInterval(this.findInterval); } catch (_) {} }
      this.attached = false;
    }
  }

  const cronoWatcher = new AuctionCronoWatcher();

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type === "EL_TIKTOK_AUCTION_REQUEST") {
      sendRuntimeMessage({ type: "EL_TIKTOK_AUCTION_REQUEST", request: event.data.request });
      return;
    }
    if (event.data?.type === "EL_TIKTOK_AUCTION_RESPONSE") {
      const payload = event.data.payload || {};
      const raw = [payload.url, payload.body, payload.responseText].filter(Boolean).join(" | ");
      const auctionEvent = buildEventFromText(raw, payload.source || "auction_api_response", { pageUrl: payload.pageUrl || location.href });
      if (auctionEvent) emitAuctionEvent(auctionEvent);
    }
  });

  chrome.runtime?.onMessage?.addListener?.((message) => {
    if (message?.type === "EL_SCAN_AUCTION_NOW") scanDom("runtime");
  });

  installAuctionApiHook();

  const start = () => {
    postAuctionEvent({ source: "auction_watcher_started", pageUrl: location.href, title: document.title, detectedAt: new Date().toISOString() });
    scanDom("initial");
    setTimeout(() => scanDom("initial_1500"), 1500);
    setInterval(() => scanDom("tick"), SCAN_INTERVAL_MS);
    setInterval(checkExtensionContext, 20000);
    const obs = new MutationObserver(() => scheduleScan("mutation"));
    obs.observe(document.documentElement || document.body, { childList: true, subtree: true, characterData: true });
    cronoWatcher.start();
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
