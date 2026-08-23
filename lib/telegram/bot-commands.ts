import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllRows } from "@/lib/supabase-paginate";
import { escapeHtml } from "@/lib/telegram/send-telegram-message";

function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "€";
}

type UserRow = {
  id: string;
  email: string;
  tenant_id: string | null;
  mfa_enabled: boolean;
  mfa_method: string | null;
  mfa_exempt: boolean;
};

async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { data } = await supabaseAdmin
    .from("users")
    .select("id, email, tenant_id, mfa_enabled, mfa_method, mfa_exempt")
    .ilike("email", email.trim())
    .maybeSingle();
  return (data as UserRow) ?? null;
}

async function getBusinessName(tenantId: string | null): Promise<string> {
  if (!tenantId) return "—";
  const { data } = await supabaseAdmin.from("tenants").select("business_name").eq("id", tenantId).maybeSingle();
  return data?.business_name || tenantId;
}

/** Cabecera común a todas las respuestas: a quién corresponde la consulta. */
function header(email: string, business: string): string {
  return `👤 <b>${escapeHtml(business)}</b>\n${escapeHtml(email)}\n\n`;
}

async function cmdSaldo(user: UserRow, business: string): Promise<string> {
  const { data: balance } = await supabaseAdmin
    .from("user_balances")
    .select("balance_cents, is_blocked, block_reason")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!balance) return header(user.email, business) + "Sin saldo registrado todavía.";
  const cents = Number(balance.balance_cents ?? 0);
  const line = cents < 0 ? `💸 Saldo: <b>-${formatEuros(Math.abs(cents))}</b> (en negativo)` : `💰 Saldo: <b>${formatEuros(cents)}</b>`;
  const blocked = balance.is_blocked
    ? `\n⛔ Cuenta bloqueada${balance.block_reason ? ` — ${escapeHtml(balance.block_reason)}` : ""}`
    : "";
  return header(user.email, business) + line + blocked;
}

async function cmdConsumoTotal(user: UserRow, business: string): Promise<string> {
  if (!user.tenant_id) return header(user.email, business) + "Sin tenant asociado.";
  const rows = await fetchAllRows<{ price_cents: number }>((from, to) =>
    supabaseAdmin.from("orders_processed").select("price_cents").eq("tenant_id", user.tenant_id as string).range(from, to)
  );
  const totalCents = rows.reduce((sum, r) => sum + (r.price_cents ?? 0), 0);
  return header(user.email, business) + `📄 Consumo total (desde el alta): <b>${formatEuros(totalCents)}</b>\n🏷️ Etiquetas: <b>${rows.length}</b>`;
}

async function cmdRango(user: UserRow, business: string): Promise<string> {
  const { data: balance } = await supabaseAdmin
    .from("user_balances")
    .select("current_tier")
    .eq("user_id", user.id)
    .maybeSingle();
  const tier = balance?.current_tier ?? 1;
  const { data: pricing } = await supabaseAdmin.from("pricing_tiers").select("label, price_cents").eq("tier", tier).maybeSingle();
  const label = pricing?.label ?? `Nivel ${tier}`;
  const price = pricing?.price_cents != null ? formatEuros(pricing.price_cents) : "—";
  return header(user.email, business) + `🎚️ Rango: <b>${escapeHtml(label)}</b>\nPrecio por etiqueta: <b>${price}</b>`;
}

async function cmdDemo(user: UserRow, business: string): Promise<string> {
  const { data: balance } = await supabaseAdmin.from("user_balances").select("is_demo").eq("user_id", user.id).maybeSingle();
  const isDemo = !!balance?.is_demo;
  return header(user.email, business) + (isDemo ? "🆓 Modo demo: <b>sí</b> — imprime gratis." : "💳 Modo demo: <b>no</b> — cobra normal.");
}

async function cmdEstado(user: UserRow, business: string): Promise<string> {
  if (!user.tenant_id) return header(user.email, business) + "Sin tenant asociado.";
  const { data: tenant } = await supabaseAdmin.from("tenants").select("status").eq("id", user.tenant_id).maybeSingle();
  const active = (tenant?.status ?? "active") === "active";
  return header(user.email, business) + (active ? "✅ Estado: <b>activo</b>" : "🚫 Estado: <b>de baja</b>");
}

async function cmdMfa(user: UserRow, business: string): Promise<string> {
  let value: string;
  if (user.mfa_exempt) value = "Exento (sin MFA por decisión de administración)";
  else if (!user.mfa_enabled) value = "Ninguno (sin configurar)";
  else if (user.mfa_method === "totp") value = "📱 App/QR (TOTP)";
  else if (user.mfa_method === "email") value = "📧 Email";
  else value = "Activado (método desconocido)";
  return header(user.email, business) + `🔐 MFA: <b>${value}</b>`;
}

const COMMANDS: Record<string, (user: UserRow, business: string) => Promise<string>> = {
  saldo: cmdSaldo,
  consumototal: cmdConsumoTotal,
  rango: cmdRango,
  demo: cmdDemo,
  estado: cmdEstado,
  mfa: cmdMfa,
};

const HELP_TEXT =
  "🤖 <b>Comandos disponibles</b>\n\n" +
  "Todos se usan como <code>/comando email@cliente.com</code>:\n\n" +
  "• /saldo — saldo actual\n" +
  "• /consumototal — consumo total desde el alta\n" +
  "• /rango — nivel de precio (tier)\n" +
  "• /demo — si imprime gratis o no\n" +
  "• /estado — activo o de baja\n" +
  "• /mfa — método de verificación en dos pasos";

/**
 * Procesa un mensaje de texto recibido del bot y devuelve la respuesta ya
 * lista para mandar (HTML). Nunca lanza — cualquier fallo se convierte en un
 * mensaje de error legible en el propio chat.
 */
export async function handleBotCommand(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return HELP_TEXT;

  const [rawCommand, ...rest] = trimmed.slice(1).split(/\s+/);
  const command = rawCommand.toLowerCase().split("@")[0]; // admite "/saldo@NombreDelBot"
  const email = rest.join(" ").trim();

  if (command === "start" || command === "help" || command === "ayuda") return HELP_TEXT;

  const handler = COMMANDS[command];
  if (!handler) return `❓ No conozco el comando /${escapeHtml(command)}.\n\n${HELP_TEXT}`;

  if (!email) return `Falta el email. Uso: <code>/${escapeHtml(command)} email@cliente.com</code>`;

  try {
    const user = await findUserByEmail(email);
    if (!user) return `⚠️ No encuentro ningún usuario con el email <code>${escapeHtml(email)}</code>.`;
    const business = await getBusinessName(user.tenant_id);
    return await handler(user, business);
  } catch (err) {
    console.error("[Telegram bot] Error procesando comando:", err);
    return `🚨 Error consultando los datos: ${escapeHtml(err instanceof Error ? err.message : "desconocido")}`;
  }
}
