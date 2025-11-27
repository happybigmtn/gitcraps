/**
 * SWR (stale-while-revalidate) configuration for RPC data fetching
 * This provides the foundation for replacing manual polling with SWR
 *
 * Note: Install SWR with `npm install swr` before using these configs
 */

/**
 * SWR Configuration type (inline to avoid dependency until SWR is installed)
 */
export interface SwrConfig {
  refreshInterval?: number;
  revalidateOnFocus?: boolean;
  shouldRetryOnError?: boolean;
  errorRetryInterval?: number;
  errorRetryCount?: number;
  dedupingInterval?: number;
  keepPreviousData?: boolean;
  onErrorRetry?: (
    error: Error,
    key: string,
    config: SwrConfig,
    revalidate: (opts?: { retryCount?: number }) => void,
    revalidateOpts: { retryCount: number }
  ) => void;
}

/**
 * Default SWR configuration for game data
 */
export const gameDataConfig: SwrConfig = {
  // Refresh every 15 seconds for mainnet, faster for localnet
  refreshInterval: 15000,

  // Don't revalidate on window focus (causes too many requests)
  revalidateOnFocus: false,

  // Retry on error with exponential backoff
  shouldRetryOnError: true,
  errorRetryInterval: 5000,
  errorRetryCount: 3,

  // Dedupe requests within 2 seconds
  dedupingInterval: 2000,

  // Keep previous data while fetching
  keepPreviousData: true,
};

/**
 * Configuration for localnet (faster polling)
 */
export const localnetConfig: SwrConfig = {
  ...gameDataConfig,
  refreshInterval: 1000, // 1 second for localnet
  errorRetryInterval: 2000,
};

/**
 * Custom error retry handler for rate limiting
 */
export const onErrorRetry = (
  error: Error,
  _key: string,
  _config: SwrConfig,
  revalidate: (opts?: { retryCount?: number }) => void,
  { retryCount }: { retryCount: number }
) => {
  // Don't retry on 4xx errors (except 429)
  if (error.message?.includes('4') && !error.message?.includes('429')) {
    return;
  }

  // Rate limit: exponential backoff
  if (error.message?.includes('429')) {
    const backoff = Math.min(30000, 5000 * Math.pow(2, retryCount));
    setTimeout(() => revalidate({ retryCount }), backoff);
    return;
  }

  // Max 5 retries
  if (retryCount >= 5) return;

  // Default retry after 5 seconds
  setTimeout(() => revalidate({ retryCount }), 5000);
};

/**
 * Get config based on network
 */
export function getSwrConfig(network: 'mainnet' | 'devnet' | 'localnet'): SwrConfig {
  if (network === 'localnet') {
    return { ...localnetConfig, onErrorRetry };
  }
  return { ...gameDataConfig, onErrorRetry };
}
