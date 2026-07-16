import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 px-4 py-4 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-2">
          <Image src="/logo-woowtienda.png" alt="Woow Insólito" width={28} height={30} />
          <span>© {new Date().getFullYear()} LUCKY BARNAVIT, S.L. — N.I.F. B-05380084</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4">
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
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
