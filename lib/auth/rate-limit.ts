import "server-only";

// Limitador en memoria del propio proceso Node (pm2, proceso único en el VPS,
// igual que el server.js actual) — suficiente para frenar fuerza bruta/credential
// stuffing sin depender de infraestructura extra.
const attempts = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 10 * 60 * 1000; // 10 minutos
const MAX_ATTEMPTS = 8;

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export function resetRateLimit(key: string): void {
  attempts.delete(key);
}
