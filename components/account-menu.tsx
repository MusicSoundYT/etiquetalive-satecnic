"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function AccountMenu({
  name,
  email,
  isAdmin,
}: {
  name: string;
  email: string;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const initial = name?.trim()?.[0]?.toUpperCase() || "?";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
        aria-label="Cuenta"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-100 px-4 py-2 dark:border-zinc-800">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{name}</p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{email}</p>
          </div>
          <Link
            href="/dashboard"
            className="block px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
            onClick={() => setOpen(false)}
          >
            Pedidos
          </Link>
          <Link
            href="/templates"
            className="block px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
            onClick={() => setOpen(false)}
          >
            Plantilla
          </Link>
          <Link
            href="/account/recharge"
            className="block px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
            onClick={() => setOpen(false)}
          >
            Renovación
          </Link>
          <Link
            href="/account"
            className="block px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
            onClick={() => setOpen(false)}
          >
            Configuración
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className="block px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
              onClick={() => setOpen(false)}
            >
              Administración
            </Link>
          )}
          <button
            onClick={handleLogout}
            className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-zinc-50 dark:text-red-400 dark:hover:bg-zinc-800"
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
