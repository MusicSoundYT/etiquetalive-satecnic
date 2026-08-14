// El puente con Caja TikTok es solo para los clientes que aparecen aquí — no
// hay forma de adivinar la pareja tenant de Etiquetas Live ↔ grupo de Caja
// TikTok automáticamente (los nombres no coinciden entre los dos sistemas),
// así que se empareja a mano cada vez que un cliente nuevo se suma.
export type CajaTikTokPair = { tenantId: string; grupoNombre: string };

export const CAJATIKTOK_TENANTS: CajaTikTokPair[] = [
  { tenantId: "17edac49-7e7c-45d8-9b16-4baa7b7ac8fe", grupoNombre: "Woow Insólito" },
  { tenantId: "3e4cb6e8-74e0-4ed4-863d-578d2ce9df55", grupoNombre: "Magic Days" },
];

export function findByGrupoNombre(grupoNombre: string): CajaTikTokPair | undefined {
  return CAJATIKTOK_TENANTS.find((p) => p.grupoNombre === grupoNombre);
}
