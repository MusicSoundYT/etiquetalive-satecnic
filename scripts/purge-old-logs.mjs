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

async function deleteInBatches(client, label, deleteOneBatchSql) {
  let total = 0;
  for (;;) {
    const { rowCount } = await client.query(deleteOneBatchSql);
    total += rowCount;
    if (rowCount < BATCH_SIZE) break;
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
    // auction_events_v2.duplicate_of referencia a la propia tabla — si no se
    // rompe antes ese enlace, borrar una fila antigua a la que todavía
    // apunte una fila reciente fallaría por la FK. También por lotes.
    let brokenLinks = 0;
    for (;;) {
      const { rowCount } = await client.query(
        `UPDATE auction_events_v2 SET duplicate_of = NULL
         WHERE id IN (
           SELECT id FROM auction_events_v2
           WHERE duplicate_of IN (
             SELECT id FROM auction_events_v2 WHERE detected_at < now() - interval '${RETENTION_DAYS} days'
           )
           LIMIT ${BATCH_SIZE}
         )`
      );
      brokenLinks += rowCount;
      if (rowCount < BATCH_SIZE) break;
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
    if (brokenLinks) console.log(`[${new Date().toISOString()}] Enlaces duplicate_of desligados: ${brokenLinks}`);

    await deleteInBatches(
      client,
      "auction_events_v2",
      `DELETE FROM auction_events_v2 WHERE id IN (
         SELECT id FROM auction_events_v2 WHERE detected_at < now() - interval '${RETENTION_DAYS} days' LIMIT ${BATCH_SIZE}
       )`
    );
    await deleteInBatches(
      client,
      "order_scan_log",
      `DELETE FROM order_scan_log WHERE id IN (
         SELECT id FROM order_scan_log WHERE captured_at < now() - interval '${RETENTION_DAYS} days' LIMIT ${BATCH_SIZE}
       )`
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[purge-old-logs] Error:", err);
  process.exitCode = 1;
});
