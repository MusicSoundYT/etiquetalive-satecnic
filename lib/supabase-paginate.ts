import "server-only";

/**
 * PostgREST (Supabase) limita cada respuesta a un máximo de filas (por
 * defecto 1000) aunque no se pida `.limit()` explícito. Para sumas/conteos
 * agregados en memoria sobre tablas que pueden superar ese límite, hay que
 * paginar con `.range()` hasta agotar los resultados.
 */
export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
