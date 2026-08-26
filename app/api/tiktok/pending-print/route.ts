import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getDefaultTemplate } from "@/lib/labels/get-default-template";
import { generateLabelHtml } from "@/lib/labels/render";

const MAX_PER_POLL = 5;
// Cuánto tiempo se considera "reciente" un ganador visto por la extensión en
// el directo — más allá de esto, no se usa para emparejar (podría ser de
// otra sesión, o la extensión llevar un rato sin refrescar).
const WINNER_SIGHTING_WINDOW_MS = 10 * 60 * 1000;
// Si un pedido lleva más de esto esperando sin que ninguna estación lo
// reclame (p. ej. porque el nombre no coincidió bien, o nadie tiene la
// extensión activa en ese directo), se entrega igual a quien pregunte —
// nunca se debe perder una etiqueta por un fallo de emparejamiento. Se
// mantiene corto (no 0) a propósito: da un margen breve para que la
// estación correcta detecte al ganador antes de que CUALQUIER estación de
// ese mismo tenant pueda llevárselo — bajarlo a 0 abriría la puerta a que,
// con dos directos simultáneos de verdad, la que pregunte primero se lleve
// pedidos que no son suyos.
const UNMATCHED_GRACE_MS = 15 * 1000;
// Se piden más candidatos de los que se van a devolver porque, con filtro de
// estación activo, algunos se descartan sin reclamar (no del todo, no toca
// aún el margen de gracia) — hay que tener margen para completar MAX_PER_POLL.
const CANDIDATE_POOL_SIZE = 20;

function normalizeName(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * La extensión a veces manda el texto del ganador con basura pegada del DOM
 * ("Letty:13 €Artículos vendidos:76") — el nombre real es lo de antes del
 * primer ":". Se limpia aquí también (no solo en la extensión) por si algún
 * ordenador todavía tiene una versión antigua sin el recorte hecho.
 */
function cleanWinnerName(raw: string): string {
  return String(raw || "").split(":")[0].trim();
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * TikTok a veces devuelve recipient_address.name ya enmascarado (p. ej.
 * "M***se S***s S***hez") incluso para pedidos recién creados, mientras que
 * la extensión ve el nombre completo sin enmascarar en la propia página del
 * directo — visto en producción durante una subasta en directo. El
 * enmascarado de TikTok conserva la primera letra y la longitud EXACTA de
 * cada palabra, así que se puede comparar por iniciales+longitud en vez de
 * por texto: namesMatch() por sí sola nunca puede acertar aquí, los
 * asteriscos rompen la comparación normal.
 */
function maskedNameMatches(cliente: string, winner: string): boolean {
  if (!cliente.includes("*")) return false;
  const maskedWords = stripAccents(cliente.toLowerCase()).split(/\s+/).filter(Boolean);
  const winnerWords = stripAccents(cleanWinnerName(winner).toLowerCase())
    .replace(/[^a-z0-9* ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!maskedWords.length || !winnerWords.length) return false;
  return maskedWords.every((mw) =>
    mw.includes("*")
      ? winnerWords.some((ww) => ww[0] === mw[0] && ww.length === mw.length)
      : winnerWords.some((ww) => ww === mw)
  );
}

function namesMatch(cliente: string, winner: string): boolean {
  const a = normalizeName(cliente);
  const b = normalizeName(cleanWinnerName(winner));
  if (a && b && (a.includes(b) || b.includes(a))) return true;
  return maskedNameMatches(cliente, winner);
}

/**
 * Consultado cada pocos segundos por la pestaña de Pedidos (API): devuelve
 * pedidos ya cobrados (impresiones_cobrables > 0) que todavía no se le han
 * entregado a ninguna impresora (label_delivered_at IS NULL) — vengan de
 * donde vengan (extensión o webhook automático). El reclamo es atómico
 * (UPDATE ... WHERE label_delivered_at IS NULL): si la extensión y este
 * sondeo compiten por el mismo pedido, solo uno de los dos se lo lleva,
 * nunca los dos — así esta vía también sirve de red de seguridad si la
 * extensión cobra un pedido pero falla al imprimirlo.
 *
 * shop_id (opcional): cuando un tenant tiene varias tiendas de TikTok
 * conectadas (varias trabajadoras, cada una con la suya), sin este filtro
 * cualquier pestaña abierta con la misma cuenta de EtiquetaLive imprimía
 * los pedidos de TODAS las tiendas, no solo la de quien la tiene abierta.
 *
 * station_id (opcional): cuando el mismo tenant tiene DOS directos
 * simultáneos colgando de la MISMA tienda (mismo shop_id — no hay forma de
 * distinguirlos por shop_id ni por ningún dato de la API de TikTok), cada
 * ordenador puede indicar su propia "estación". Si se manda, solo se
 * reclaman los pedidos cuyo cliente coincida con un ganador visto
 * recientemente por la extensión EN ESA estación (auction_events_v2) — así
 * cada ordenador solo se lleva las etiquetas de su propio directo. Si no se
 * manda (o nadie tiene la extensión configurada), se comporta exactamente
 * como antes: sin filtrar.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.tenant_id) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const shopId = req.nextUrl.searchParams.get("shop_id");
  const stationId = req.nextUrl.searchParams.get("station_id");

  let query = supabaseAdmin
    .from("orders")
    .select("id, cliente, fecha_detectado")
    .eq("tenant_id", user.tenant_id)
    .gt("impresiones_cobrables", 0)
    .is("label_delivered_at", null);
  if (shopId) query = query.eq("tiktok_shop_id", shopId);

  const { data: candidates } = await query
    .order("fecha_detectado", { ascending: true })
    .limit(stationId ? CANDIDATE_POOL_SIZE : MAX_PER_POLL);

  if (!candidates?.length) return NextResponse.json({ orders: [] });

  let recentWinners: string[] = [];
  if (stationId) {
    const since = new Date(Date.now() - WINNER_SIGHTING_WINDOW_MS).toISOString();
    const { data: sightings } = await supabaseAdmin
      .from("auction_events_v2")
      .select("winner")
      .eq("tenant_id", user.tenant_id)
      .eq("station_id", stationId)
      .not("winner", "is", null)
      .gte("detected_at", since)
      .limit(200);
    recentWinners = (sightings ?? []).map((s) => s.winner as string).filter(Boolean);
  }

  const eligible = candidates.filter((candidate) => {
    if (!stationId) return true; // sin estación: comportamiento de siempre, sin filtrar
    const isStale = Date.now() - new Date(candidate.fecha_detectado as string).getTime() > UNMATCHED_GRACE_MS;
    if (isStale) return true; // margen de gracia: nunca se pierde una etiqueta por no emparejar
    return recentWinners.some((winner) => namesMatch(candidate.cliente as string, winner));
  });

  const template = await getDefaultTemplate(user.tenant_id);
  const results: { id: string; tk: string; label_html: string }[] = [];

  for (const candidate of eligible) {
    if (results.length >= MAX_PER_POLL) break;
    const { data: claimed } = await supabaseAdmin
      .from("orders")
      .update({ label_delivered_at: new Date().toISOString() })
      .eq("id", candidate.id)
      .is("label_delivered_at", null)
      .select("*")
      .maybeSingle();
    if (!claimed) continue; // otra pestaña (o la extensión) se lo llevó primero

    const html = await generateLabelHtml(claimed, template, { preview: false });
    results.push({ id: claimed.id, tk: claimed.tk, label_html: html });
  }

  return NextResponse.json({ orders: results });
}
