"use client";

import { useEffect, useState } from "react";

type Tier = { tier: number; price_cents: number; label: string };

export function AdminPricingTiers() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/admin/pricing-tiers")
      .then((r) => r.json())
      .then((d) => setTiers(d.tiers ?? []));
  }, []);

  async function save(tier: Tier) {
    setSaving(tier.tier);
    try {
      await fetch("/api/admin/pricing-tiers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: tier.tier, priceCents: tier.price_cents, label: tier.label }),
      });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-3">
      {tiers.map((t) => (
        <div
          key={t.tier}
          className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <span className="w-16 text-sm font-medium text-zinc-500 dark:text-zinc-400">Rango {t.tier}</span>
          <input
            className="w-40 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            value={t.label}
            onChange={(e) =>
              setTiers((prev) => prev.map((p) => (p.tier === t.tier ? { ...p, label: e.target.value } : p)))
            }
          />
          <div className="flex items-center gap-1 text-sm">
            <input
              type="number"
              step="1"
              className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              value={t.price_cents}
              onChange={(e) =>
                setTiers((prev) =>
                  prev.map((p) => (p.tier === t.tier ? { ...p, price_cents: Number(e.target.value) } : p))
                )
              }
            />
            <span className="text-zinc-500 dark:text-zinc-400">céntimos/etiqueta</span>
          </div>
          <button
            onClick={() => save(t)}
            disabled={saving === t.tier}
            className="ml-auto rounded bg-zinc-900 px-3 py-1 text-xs text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {saving === t.tier ? "Guardando..." : "Guardar"}
          </button>
        </div>
      ))}
    </div>
  );
}
