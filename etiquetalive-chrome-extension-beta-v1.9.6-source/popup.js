const API = "https://etiquetalive.satecnic.es";

async function sign(body, apiKey) {
  // HMAC-SHA256 real usando la propia API key como clave.
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(apiKey || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body || ''));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const msg = document.getElementById('msg');
const key = document.getElementById('key');
const btn = document.getElementById('btn');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const sessionRow = document.getElementById('sessionRow');

function setMsg(t, txt) { msg.className = t; msg.textContent = txt; msg.style.display = 'block'; }

function notifyTabs(payload) {
  try { chrome.tabs.query({url:'https://seller-es.tiktok.com/*'}, tabs => { for (const t of tabs||[]) chrome.tabs.sendMessage(t.id, payload, ()=>void chrome.runtime.lastError); }); } catch(e) {}
}

btn.onclick = async () => {
  const k = key.value.trim();
  if (!k || k.length < 10) return setMsg('err', 'API key inválida');
  btn.disabled = true; btn.textContent = '...';
  setMsg('wait', 'Verificando...');
  try {
    const r = await fetch(API + '/api/v1/profile/api-key', {
      headers: { 'x-api-key': k, 'x-el-sign': await sign(JSON.stringify({}), k) }
    });
    if(!r.ok) return setMsg('err', 'API key inválida');
    const profile = await r.json().catch(() => ({}));
    const autoPrintEnabled = profile.auto_print_enabled !== 0;
    setMsg('ok', autoPrintEnabled ? '✅ Conectado · Auto impresión ON' : '✅ Conectado · Auto impresión OFF');
    chrome.storage.local.set({
      el_api_key: k,
      el_auto_print_enabled: autoPrintEnabled,
      el_seller_refresh_ms: Math.max(5000, Math.min(60000, Number(profile.seller_refresh_seconds || 10) * 1000)),
      el_revoked: false  // limpiar flag al re-conectar
    });
    sessionRow.style.display = 'flex';
    // Disparar heartbeat inmediato al conectar (C4-F M3)
    try { chrome.runtime.sendMessage({ type: 'EL_HEARTBEAT_NOW' }, () => void chrome.runtime.lastError); } catch(_) {}
  } catch(e) { setMsg('err', 'Error: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = 'Conectar'; }
};

startBtn.onclick = () => {
  chrome.storage.local.set({
    el_print_session_active: true, el_print_session_started_at: Date.now(),
    el_print_session_stats: {detected: 0, printed: 0},
    el_print_session_detected_ids: [], el_print_session_printed_ids: [],
    el_print_session_ignored_ids: [], el_print_session_baseline_done: false
  }, () => {
    setMsg('ok', '🟢 Live activo');
    startBtn.disabled = true; stopBtn.disabled = false;
    notifyTabs({type: 'EL_SESSION_CHANGED', active: true});
  });
};

stopBtn.onclick = () => {
  chrome.storage.local.set({el_print_session_active: false}, () => {
    setMsg('wait', 'Live parado');
    startBtn.disabled = false; stopBtn.disabled = true;
    notifyTabs({type: 'EL_SESSION_CHANGED', active: false});
  });
};

chrome.storage.local.get(['el_api_key', 'el_print_session_active', 'el_revoked'], r => {
  if (r.el_api_key) { key.value = r.el_api_key; btn.click(); }
  if (r.el_api_key) sessionRow.style.display = 'flex';
  startBtn.disabled = Boolean(r.el_print_session_active);
  stopBtn.disabled = !r.el_print_session_active;
  // C4-F M3 — banner si dispositivo revocado
  if (r.el_revoked) {
    setMsg('err', '⚠️ Dispositivo revocado · Impresión pausada. Contacta @Dvid_woow');
    startBtn.disabled = true;
    stopBtn.disabled = true;
  }
});