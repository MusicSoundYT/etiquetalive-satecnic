(() => {
  function forward(message) {
    try {
      window.postMessage(message, window.location.origin);
    } catch (_) {}
    try {
      localStorage.setItem("el_live_screen_state", JSON.stringify({ ...message, bridgeAt: Date.now() }));
    } catch (_) {}
    try {
      const channel = new BroadcastChannel("etiquetalive-live-screen");
      channel.postMessage(message);
      channel.close();
    } catch (_) {}
  }

  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || typeof message !== "object") return false;
      if (
        message.type === "EL_CHRONO_TICK" ||
        message.type === "EL_AUCTION_CLOSING" ||
        message.type === "EL_AUCTION_AWARDED" ||
        message.type === "EL_NO_RESULT"
      ) {
        forward(message);
      }
      return false;
    });
  } catch (_) {}
})();
