/**
 * Simple request deduplication cache for RPC calls
 * Prevents multiple in-flight requests for the same data
 */

type CacheEntry<T> = {
  promise: Promise<T>;
  expiresAt: number;
};

const requestCache = new Map<string, CacheEntry<unknown>>();

/**
 * Deduplicate concurrent RPC requests
 * If a request for the same key is already in flight, return that promise
 * @param key Unique identifier for the request
 * @param fetcher Function that performs the actual fetch
 * @param ttl Time-to-live in ms (default 1000ms)
 */
export async function deduplicatedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 1000
): Promise<T> {
  const now = Date.now();
  const cached = requestCache.get(key) as CacheEntry<T> | undefined;

  // Return cached promise if still valid
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  // Create new request
  const promise = fetcher().finally(() => {
    // Clean up after TTL
    setTimeout(() => {
      const entry = requestCache.get(key);
      if (entry && entry.promise === promise) {
        requestCache.delete(key);
      }
    }, ttl);
  });

  requestCache.set(key, {
    promise,
    expiresAt: now + ttl,
  });

  return promise;
}
