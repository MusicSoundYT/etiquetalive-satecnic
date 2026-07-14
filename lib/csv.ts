import "server-only";

/** Serializa filas a CSV con separador ";" (compatible con Excel en configuración regional española). */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T; label: string }[]
): string {
  function escape(value: unknown): string {
    const str = String(value ?? "");
    return /[";\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  }

  const header = columns.map((c) => escape(c.label)).join(";");
  const lines = rows.map((row) => columns.map((c) => escape(row[c.key])).join(";"));
  return [header, ...lines].join("\r\n");
}
