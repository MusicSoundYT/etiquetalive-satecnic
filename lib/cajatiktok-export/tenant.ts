// El puente con Caja TikTok es, por ahora, solo para Woow Insólito — antes
// de que hubiera más de una conexión de TikTok Shop en el sistema, estas
// funciones cogían "la que hubiera" (limit(1)). Desde que Magic Days puede
// tener su propia conexión, eso pasa a ser ambiguo, así que se fija el
// tenant explícitamente en vez de adivinarlo.
export const CAJATIKTOK_TENANT_ID = "17edac49-7e7c-45d8-9b16-4baa7b7ac8fe";
