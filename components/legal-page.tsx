import Link from "next/link";

export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl flex-1 px-4 py-12">
      <Link href="/login" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
        ← Volver
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{title}</h1>
      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">Última actualización: 14 de julio de 2026</p>
      <div
        className="mt-8 space-y-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300
        [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-zinc-900 [&_h2]:dark:text-zinc-50
        [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1
        [&_a]:underline [&_strong]:font-semibold"
      >
        {children}
      </div>
    </div>
  );
}
