(() => {
  if (window.__EtiquetaLiveAuctionApiHookInstalled) return;
  window.__EtiquetaLiveAuctionApiHookInstalled = true;

  const AUCTION_HINT = /(auction|bid|winner|won|live|streamer|product|subasta|ganador|buyer|order)/i;
  const NOISE = /(captcha|analytics|log|report|pixel|webcast|impression|performance|sentry|slardar)/i;

  function headersToObject(headers) {
    const out = {};
    try {
      if (!headers) return out;
      if (headers instanceof Headers) headers.forEach((value, key) => { out[key] = value; });
      else if (Array.isArray(headers)) for (const [key, value] of headers) out[key] = value;
      else if (typeof headers === "object") Object.assign(out, headers);
    } catch {}
    return out;
  }

  function shouldCapture(url, body, headers) {
    const haystack = [url, body, JSON.stringify(headers || {})].filter(Boolean).join(" ");
    return AUCTION_HINT.test(haystack) && !NOISE.test(haystack);
  }

  function emit(request) {
    try { window.postMessage({ type: "EL_TIKTOK_AUCTION_REQUEST", request }, "*"); } catch {}
  }

  function emitResponse(payload) {
    try { window.postMessage({ type: "EL_TIKTOK_AUCTION_RESPONSE", payload }, "*"); } catch {}
  }

  function looksLikeWinnerText(text) {
    return /(ganador|ganadora|winner|won by|comprador|buyer|ganador\s+de\s+esta\s+ronda)/i.test(String(text || ""));
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = function(input, init = {}) {
      try {
        const url = typeof input === "string" ? input : input?.url;
        const method = (init?.method || input?.method || "GET").toUpperCase();
        const headers = headersToObject(init?.headers || input?.headers);
        const body = typeof init?.body === "string" ? init.body : undefined;
        if (url && shouldCapture(url, body, headers)) emit({ url, method, headers, body, pageUrl: location.href, source: "fetch" });
      } catch {}
      const result = originalFetch.apply(this, arguments);
      try {
        result.then((response) => {
          try {
            const clone = response.clone();
            const ct = clone.headers?.get?.("content-type") || "";
            if (/json|text|javascript/i.test(ct)) {
              clone.text().then((text) => {
                if (looksLikeWinnerText(text)) emitResponse({ url, method, body, responseText: text.slice(0, 12000), pageUrl: location.href, source: "fetch_response" });
              }).catch(() => {});
            }
          } catch {}
        }).catch(() => {});
      } catch {}
      return result;
    };
  }

  const OriginalXHR = window.XMLHttpRequest;
  if (typeof OriginalXHR === "function") {
    const originalOpen = OriginalXHR.prototype.open;
    const originalSend = OriginalXHR.prototype.send;
    const originalSetHeader = OriginalXHR.prototype.setRequestHeader;

    OriginalXHR.prototype.open = function(method, url) {
      this.__elAuctionReq = { method: String(method || "GET").toUpperCase(), url: String(url || ""), headers: {}, source: "xhr" };
      return originalOpen.apply(this, arguments);
    };

    OriginalXHR.prototype.setRequestHeader = function(key, value) {
      try { if (this.__elAuctionReq) this.__elAuctionReq.headers[String(key)] = String(value); } catch {}
      return originalSetHeader.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
      try {
        const req = this.__elAuctionReq || {};
        const bodyText = typeof body === "string" ? body : undefined;
        if (req.url && shouldCapture(req.url, bodyText, req.headers)) emit({ ...req, body: bodyText, pageUrl: location.href });
        this.addEventListener("load", function() {
          try {
            const text = String(this.responseText || "");
            if (looksLikeWinnerText(text)) emitResponse({ ...req, body: bodyText, responseText: text.slice(0, 12000), pageUrl: location.href, source: "xhr_response" });
          } catch {}
        });
      } catch {}
      return originalSend.apply(this, arguments);
    };
  }
})();
