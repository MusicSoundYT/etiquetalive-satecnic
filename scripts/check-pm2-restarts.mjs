import { execSync } from "child_process";
import fs from "fs";

// Vive fuera de la app Next.js a propósito: si la app está en bucle de
// caídas, no puede ser ella misma quien avise — este script corre por su
// cuenta vía cron del sistema, solo depende de pm2 y de la API de Telegram.
const APP_NAME = "etiquetalive";
const STATE_FILE = "/var/log/etiquetalive-pm2-restart-state.json";
// Reinicios de más en el intervalo entre dos comprobaciones (no acumulado
// desde siempre) que hacen saltar la alarma.
const RESTART_THRESHOLD = 3;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { lastCount: null };
  }
}

function writeState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("[check-pm2-restarts] Telegram no configurado, no se envía:", text);
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    if (!res.ok) console.error("[check-pm2-restarts] Error enviando a Telegram:", res.status, await res.text());
  } catch (err) {
    console.error("[check-pm2-restarts] Error de red enviando a Telegram:", err);
  }
}

const raw = execSync("pm2 jlist", { encoding: "utf8" });
const list = JSON.parse(raw);
const proc = list.find((p) => p.name === APP_NAME);
if (!proc) {
  console.error(`[check-pm2-restarts] No se encontró el proceso "${APP_NAME}" en pm2.`);
  process.exit(1);
}

const restartCount = proc.pm2_env?.restart_time ?? 0;
const status = proc.pm2_env?.status ?? "desconocido";
const state = readState();
const delta = state.lastCount == null ? 0 : restartCount - state.lastCount;

if (delta >= RESTART_THRESHOLD) {
  await sendTelegram(
    `🚨 <b>${APP_NAME} en bucle de caídas</b>\nSe ha reiniciado <b>${delta}</b> veces desde la última comprobación.\nEstado actual: ${status} · Total histórico: ${restartCount}`
  );
}

writeState({ lastCount: restartCount });
