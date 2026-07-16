"use client";

import { useEffect, useState } from "react";

type ThemePref = "light" | "dark" | "auto";
const STORAGE_KEY = "el_theme";

function applyTheme(pref: ThemePref) {
  const isDark = pref === "dark" || (pref === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
}

export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>("auto");

  // Lee la preferencia guardada tras montar (no existe en el servidor) — el
  // <html> ya se pinta con el tema correcto desde antes gracias al script
  // inline de app/layout.tsx, esto solo sincroniza el propio selector.
  useEffect(() => {
    const id = setTimeout(() => {
      const stored = (localStorage.getItem(STORAGE_KEY) as ThemePref | null) ?? "auto";
      setPref(stored);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    applyTheme(pref);
    if (pref !== "auto") return;
    // En automático, si el usuario cambia el tema del sistema operativo
    // mientras tiene la página abierta, se refleja sin recargar.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("auto");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  function handleChange(value: ThemePref) {
    setPref(value);
    localStorage.setItem(STORAGE_KEY, value);
  }

  return (
    <label className="flex items-center gap-1.5">
      <span className="sr-only">Tema</span>
      <select
        value={pref}
        onChange={(e) => handleChange(e.target.value as ThemePref)}
        aria-label="Tema"
        className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs text-zinc-600 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400 dark:focus:border-zinc-100"
      >
        <option value="auto">Automático</option>
        <option value="light">Claro</option>
        <option value="dark">Oscuro</option>
      </select>
    </label>
  );
}
