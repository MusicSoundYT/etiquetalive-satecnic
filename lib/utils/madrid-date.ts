import "server-only";

// Minutos que Europe/Madrid va por delante de UTC en el instante dado
// (+60 en invierno, +120 en verano). Nunca depende de la zona horaria del
// sistema donde corra Node — todo el cálculo usa Date.UTC/getUTC* a propósito.
export function getMadridUtcOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  // Los mismos números de reloj de Madrid, pero interpretados como UTC.
  const wallClockAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((wallClockAsUtc - instant.getTime()) / 60_000);
}

// Límites [inicio, fin) en UTC del día natural indicado (Europe/Madrid).
export function madridDayRangeUtc(dateMadrid: string): { startUtc: string; endUtc: string } {
  const [year, month, day] = dateMadrid.split("-").map(Number);
  // Medianoche de Madrid tratada primero como si fuera UTC, para luego
  // restarle el desfase real de Madrid y obtener el instante UTC verdadero.
  const wallClockGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offsetMinutes = getMadridUtcOffsetMinutes(wallClockGuess);
  const startUtc = new Date(wallClockGuess.getTime() - offsetMinutes * 60_000);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60_000);
  return { startUtc: startUtc.toISOString(), endUtc: endUtc.toISOString() };
}

export function yesterdayMadridDate(): string {
  const now = new Date();
  // Reloj de Madrid ahora mismo, expresado con getUTC* para poder recortar
  // el día sin que la zona horaria del sistema interfiera.
  const madridWallClockNow = new Date(now.getTime() + getMadridUtcOffsetMinutes(now) * 60_000);
  madridWallClockNow.setUTCDate(madridWallClockNow.getUTCDate() - 1);
  return madridWallClockNow.toISOString().slice(0, 10);
}
