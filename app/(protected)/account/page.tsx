import { requireSession } from "@/lib/auth/require-session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ProfileForm } from "@/components/profile-form";
import { ApiKeyPanel } from "@/components/api-key-panel";
import { ExtensionSettingsPanel } from "@/components/extension-settings-panel";
import { MfaPanel } from "@/components/mfa-panel";
import { ChangePasswordForm } from "./change-password-form";

export default async function AccountPage() {
  const user = await requireSession();

  const { data: balance } = await supabaseAdmin
    .from("user_balances")
    .select("current_tier, balance_cents")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: mfaRow } = await supabaseAdmin
    .from("users")
    .select("mfa_method")
    .eq("id", user.id)
    .maybeSingle();

  const { data: tier } = balance
    ? await supabaseAdmin
        .from("pricing_tiers")
        .select("label, price_cents")
        .eq("tier", balance.current_tier)
        .maybeSingle()
    : { data: null };

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Configuración</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Datos de tu cuenta</p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Datos personales</h2>
        <ProfileForm
          initialName={user.name ?? ""}
          initialLastName={user.last_name ?? ""}
          initialEmail={user.email}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Tu rango</h2>
        <div className="max-w-sm rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {tier ? (
            <>
              <span className="font-medium text-zinc-900 dark:text-zinc-50">{tier.label}</span>
              <span className="text-zinc-500 dark:text-zinc-400">
                {" "}
                — {(tier.price_cents / 100).toFixed(2)}€ por etiqueta
              </span>
            </>
          ) : (
            <span className="text-zinc-500 dark:text-zinc-400">Sin rango asignado</span>
          )}
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            Tu rango refleja tu volumen de uso: cuantas más etiquetas imprimas, mejores ventajas y
            mejor precio te damos.
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Extensión de Chrome
        </h2>
        <div className="max-w-sm rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Todavía no está publicada en la Chrome Web Store, así que se instala manualmente:
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-zinc-500 dark:text-zinc-400">
            <li>Descarga el .zip y descomprímelo en tu ordenador.</li>
            <li>
              Abre <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">chrome://extensions</code> en
              Chrome.
            </li>
            <li>Activa &quot;Modo de desarrollador&quot; (arriba a la derecha).</li>
            <li>Pulsa &quot;Cargar descomprimida&quot; y selecciona la carpeta descomprimida.</li>
          </ol>
          <a
            href="/api/extension/download"
            className="mt-3 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Descargar extensión (.zip)
          </a>
          <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
            Si ya la tenías instalada y quieres actualizarla a una versión nueva, primero quita la
            anterior en <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">chrome://extensions</code>{" "}
            y luego carga la carpeta nueva — si dejas las dos activas a la vez, se detectarán los
            pedidos por duplicado.
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Clave API (extensión de Chrome)
        </h2>
        <ApiKeyPanel />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Configuración de la extensión
        </h2>
        <ExtensionSettingsPanel />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Verificación en dos pasos
        </h2>
        <MfaPanel method={mfaRow?.mfa_method ?? null} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Cambiar contraseña</h2>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
