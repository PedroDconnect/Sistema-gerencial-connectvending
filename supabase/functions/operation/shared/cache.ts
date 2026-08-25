// Cache técnico curto, em memória, por isolate — não é o lock de token
// (aquele é no Postgres e precisa ser correto entre instâncias). Este é só
// uma otimização best-effort para não repetir a mesma consulta à Auvo se
// /summary e /by-type caírem quase juntos na mesma instância quente.
// Sem TTL longo, sem persistir número de negócio.

type Entry = { expiresAt: number; promise: Promise<unknown> };

const store = new Map<string, Entry>();

export function getOrSet<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const existing = store.get(key);
  if (existing && existing.expiresAt > now) {
    return existing.promise as Promise<T>;
  }

  const promise = fn().catch((error) => {
    store.delete(key);
    throw error;
  });

  store.set(key, { expiresAt: now + ttlMs, promise });
  return promise as Promise<T>;
}
