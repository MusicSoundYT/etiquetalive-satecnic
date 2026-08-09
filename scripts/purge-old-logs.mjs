import pg from "pg";

// auction_events_v2 y order_scan_log son puro registro/diagnóstico (la app
// nunca vuelve a leer una fila pasado el instante en que se escribe, salvo
// la propia comprobación de duplicado más reciente en /api/auction/event) —
// a diferencia de "orders", donde impresiones_cobrables debe conservarse
// para siempre para no cobrar dos veces el mismo pedido. Por eso solo estas
// dos tablas se purgan.
const RETENTION_DAYS = 15;

// El pooler de Supabase corta cualquier sentencia a los 2 minutos — borrar
// 1M+ filas de golpe supera ese límite. Se borra en lotes pequeños en un
// bucle hasta que no quede nada, con una pausa entre lotes para no competir
// por recursos con la app en producción si hay un directo en marcha.
const BATCH_SIZE = 20_000;
const PAUSE_MS = 200;

// Borra por lotes, pasando los IDs del lote como array (requiere índice en
// la columna de fecha o en id, según la consulta) en vez de subconsultas
// anidadas — con una tabla de varios millones de filas, una subconsulta sin
// índice de apoyo puede acabar escaneándola entera en cada lote.
async function purgeTable(client, { table, dateColumn, label }) {
  let total = 0;
  for (;;) {
    const { rows } = await client.query(
      `SELECT id FROM ${table} WHERE ${dateColumn} < now() - interval '${RETENTION_DAYS} days' LIMIT ${BATCH_SIZE}`
    );
    if (!rows.length) break;
    const ids = rows.map((r) => r.id);

    if (table === "auction_events_v2") {
      // duplicate_of referencia a la propia tabla — hay que desligar antes
      // de borrar, si no la FK rechaza el DELETE.
      await client.query(`UPDATE auction_events_v2 SET duplicate_of = NULL WHERE duplicate_of = ANY($1)`, [ids]);
    }

    const { rowCount } = await client.query(`DELETE FROM ${table} WHERE id = ANY($1)`, [ids]);
    total += rowCount;
    if (rows.length < BATCH_SIZE) break;
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  console.log(`[${new Date().toISOString()}] ${label}: ${total} filas borradas.`);
  return total;
}

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("Falta SUPABASE_DB_URL en el entorno.");

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    await purgeTable(client, { table: "auction_events_v2", dateColumn: "detected_at", label: "auction_events_v2" });
    await purgeTable(client, { table: "order_scan_log", dateColumn: "captured_at", label: "order_scan_log" });
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[purge-old-logs] Error:", err);
  process.exitCode = 1;
});
