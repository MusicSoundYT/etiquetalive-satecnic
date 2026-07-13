(() => {
  if (window.__EtiquetaLiveOrderApiHookInstalled) return;
  window.__EtiquetaLiveOrderApiHookInstalled = true;

  const ORDER_HINT = /(order|orders|fulfillment|shipment|package|seller_order|reverse_order|search_order)/i;
  const NOISE = /(captcha|analytics|log|report|pixel|webcast|impression|performance|sentry)/i;

  function headersToObject(headers) {
    const out = {};
    try {
      if (!headers) return out;
      if (headers instanceof Headers) {
        headers.forEach((value, key) => { out[key] = value; });
      } else if (Array.isArray(headers)) {
        for (const [key, value] of headers) out[key] = value;
      } else if (typeof headers === "object") {
        Object.assign(out, headers);
      }
    } catch {}
    return out;
  }

  function shouldCapture(url, body, headers) {
    const haystack = [url, body, JSON.stringify(headers || {})].filter(Boolean).join(" ");
    return ORDER_HINT.test(haystack) && !NOISE.test(haystack);
  }

  function emit(request) {
    try {
      window.postMessage({ type: "EL_TIKTOK_ORDER_REQUEST", request }, "*");
    } catch {}
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = function(input, init = {}) {
      try {
        const url = typeof input === "string" ? input : input?.url;
        const method = (init?.method || input?.method || "GET").toUpperCase();
        const headers = headersToObject(init?.headers || input?.headers);
        const body = typeof init?.body === "string" ? init.body : undefined;
        if (url && shouldCapture(url, body, headers)) {
          emit({ url, method, headers, body, pageUrl: location.href, source: "fetch" });
        }
      } catch {}
      return originalFetch.apply(this, arguments);
    };
  }

  const OriginalXHR = window.XMLHttpRequest;
  if (typeof OriginalXHR === "function") {
    const originalOpen = OriginalXHR.prototype.open;
    const originalSend = OriginalXHR.prototype.send;
    const originalSetHeader = OriginalXHR.prototype.setRequestHeader;

    OriginalXHR.prototype.open = function(method, url) {
      this.__elReq = { method: String(method || "GET").toUpperCase(), url: String(url || ""), headers: {}, source: "xhr" };
      return originalOpen.apply(this, arguments);
    };

    OriginalXHR.prototype.setRequestHeader = function(key, value) {
      try {
        if (this.__elReq) this.__elReq.headers[String(key)] = String(value);
      } catch {}
      return originalSetHeader.apply(this, arguments);
    };

    OriginalXHR.prototype.send = function(body) {
      try {
        const req = this.__elReq || {};
        const bodyText = typeof body === "string" ? body : undefined;
        if (req.url && shouldCapture(req.url, bodyText, req.headers)) {
          emit({ ...req, body: bodyText, pageUrl: location.href });
        }
      } catch {}
      return originalSend.apply(this, arguments);
    };
  }
})();
