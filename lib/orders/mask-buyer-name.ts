/**
 * Enmascara el nombre del comprador para el panel de administración:
 * primera letra + asteriscos fijos (no se revela la longitud real del
 * nombre). El nombre completo nunca sale de la consulta a esta función —
 * así, aunque el admin abra el inspector (F12) y mire la respuesta de red,
 * el dato real no ha viajado nunca al navegador.
 */
export function maskBuyerName(name: string | null): string | null {
  if (!name) return name;
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  return `${trimmed[0].toUpperCase()}****`;
}
