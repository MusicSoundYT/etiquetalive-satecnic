import Link from "next/link";
import { requireSession } from "@/lib/auth/require-session";
import { AccountMenu } from "@/components/account-menu";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  const displayName = [user.name, user.last_name].filter(Boolean).join(" ") || user.email;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <Link href="/dashboard" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Etiqueta Live
        </Link>
        <nav className="flex items-center gap-4">
          <AccountMenu name={displayName} email={user.email} isAdmin={user.is_admin} />
        </nav>
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
