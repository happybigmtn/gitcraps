import { clusterApiUrl } from "@solana/web3.js";
import { NetworkMode, NetworkConfig } from "./types";

/**
 * Network configuration definitions
 *
 * Each network has a list of RPC endpoints ordered by priority.
 * The connection manager will automatically failover between them.
 */
export const NETWORK_CONFIGS: Record<NetworkMode, NetworkConfig> = {
  localnet: {
    name: "Localnet",
    endpoints: [
      "http://127.0.0.1:8899",
      "http://localhost:8899",
    ],
  },
  devnet: {
    name: "Devnet",
    endpoints: [
      process.env.NEXT_PUBLIC_RPC_ENDPOINT || "",
      "https://api.devnet.solana.com",
      "https://devnet.genesysgo.net",
      clusterApiUrl("devnet"),
    ].filter(Boolean), // Remove empty strings
  },
};

/**
 * Default connection options used across the application
 */
export const DEFAULT_CONNECTION_OPTIONS = {
  commitment: "confirmed" as const,
  confirmTransactionInitialTimeout: 60000,
  disableRetryOnRateLimit: true, // We handle retries ourselves
};

/**
 * Failover behavior configuration
 */
export const FAILOVER_CONFIG = {
  /** Number of consecutive failures before switching endpoints */
  failureThreshold: 3,
  /** Threshold for rate-limited errors (switch faster) */
  rateLimitThreshold: 1,
};
