import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 px-4 py-4 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 sm:flex-row sm:justify-between">
        <span>© {new Date().getFullYear()} UCKY BARNAVIT, S.L. — N.I.F. B-05380084</span>
        <nav className="flex gap-4">
          <Link href="/legal/aviso-legal" className="hover:underline">
            Aviso legal
          </Link>
          <Link href="/legal/privacidad" className="hover:underline">
            Privacidad
          </Link>
          <Link href="/legal/cookies" className="hover:underline">
            Cookies
          </Link>
          <Link href="/legal/terminos" className="hover:underline">
            Términos
          </Link>
        </nav>
      </div>
    </footer>
  );
}
