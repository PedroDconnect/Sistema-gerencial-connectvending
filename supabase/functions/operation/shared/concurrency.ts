// Confirmado empiricamente: disparar muitas chamadas simultâneas para a
// Auvo com o mesmo Bearer token faz a própria API deles falhar de forma
// inconsistente (404 e 500 em requisições que, feitas uma por vez, sempre
// funcionam). Por isso o /summary (7 chamadas) e a agregação por período
// (várias páginas) nunca disparam tudo de uma vez — passam por aqui.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(Math.max(limit, 1), items.length || 1) }, worker);
  await Promise.all(workers);
  return results;
}
