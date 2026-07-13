import { supabaseAdmin } from "@/lib/supabase-admin";

function StatusBadge({ status }: { status: string }) {
  const isPaid = status === "paid";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        isPaid
          ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
          : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300"
      }`}
    >
      {isPaid ? "COMPLETADO" : "PENDIENTE"}
    </span>
  );
}

export async function ReferralsPanel({ userId }: { userId: string }) {
  const { data: user } = await supabaseAdmin
    .from("users")
    .select("my_referral_code")
    .eq("id", userId)
    .maybeSingle();

  const { data: referrals } = await supabaseAdmin
    .from("referrals")
    .select("id, status, created_at, referred_user_id")
    .eq("referrer_user_id", userId)
    .order("created_at", { ascending: false });

  const referredIds = (referrals ?? []).map((r) => r.referred_user_id);
  const { data: referredUsers } =
    referredIds.length > 0
      ? await supabaseAdmin.from("users").select("id, name, email").in("id", referredIds)
      : { data: [] as { id: string; name: string | null; email: string }[] };

  const usersById = new Map((referredUsers ?? []).map((u) => [u.id, u]));

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Tu código de referido</h2>
      <p className="mt-1 font-mono text-lg tracking-wider text-zinc-900 dark:text-zinc-50">
        {user?.my_referral_code ?? "—"}
      </p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Comparte tu código: cuando tu amigo recargue 5€ o más por primera vez, le regalamos 5€
        extra a él y tú recibes 5€ automáticamente.
      </p>

      <h3 className="mt-6 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Amigos invitados</h3>
      {!referrals || referrals.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Aún no has invitado a nadie.</p>
      ) : (
        <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
          {referrals.map((r) => {
            const referred = usersById.get(r.referred_user_id);
            return (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-zinc-700 dark:text-zinc-300">
                  {referred?.name || referred?.email || "Usuario"}
                </span>
                <StatusBadge status={r.status} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
