"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "el_cookie_notice_dismissed";

/** Aviso informativo de cookies: el Servicio solo usa cookies técnicas (sesión/MFA), exentas de consentimiento. */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-white px-4 py-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Usamos únicamente cookies técnicas necesarias para el inicio de sesión y la seguridad de
          tu cuenta. No usamos cookies de analítica ni publicidad.{" "}
          <a href="/legal/cookies" className="underline">
            Más información
          </a>
          .
        </p>
        <button
          onClick={dismiss}
          className="shrink-0 rounded-lg bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
