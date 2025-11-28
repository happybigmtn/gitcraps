// @ts-ignore - lru-cache types not available but works at runtime
import LRUCache from 'lru-cache';

type RateLimitOptions = {
  interval: number; // ms
  uniqueTokenPerInterval: number;
};

export function rateLimit(options: RateLimitOptions) {
  const tokenCache = new LRUCache<string, number>({
    max: options.uniqueTokenPerInterval,
    maxAge: options.interval,
  });

  return {
    check: (limit: number, token: string): { success: boolean; remaining: number } => {
      const tokenCount = tokenCache.get(token) || 0;
      if (tokenCount >= limit) {
        return { success: false, remaining: 0 };
      }
      tokenCache.set(token, tokenCount + 1);
      return { success: true, remaining: limit - tokenCount - 1 };
    }
  };
}

export const apiLimiter = rateLimit({
  interval: 60000, // 1 minute
  uniqueTokenPerInterval: 500,
});
