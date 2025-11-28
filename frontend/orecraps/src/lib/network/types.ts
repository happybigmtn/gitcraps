import { Connection } from "@solana/web3.js";

/**
 * Supported network modes
 */
export type NetworkMode = "localnet" | "devnet";

/**
 * Configuration for network endpoints
 */
export interface NetworkConfig {
  /** Primary and fallback RPC endpoints */
  endpoints: string[];
  /** Network display name */
  name: string;
}

/**
 * Options for creating a Solana connection
 */
export interface ConnectionOptions {
  /** Commitment level for transactions */
  commitment?: "processed" | "confirmed" | "finalized";
  /** Timeout for confirming transactions (ms) */
  confirmTransactionInitialTimeout?: number;
  /** Disable automatic retry on rate limits */
  disableRetryOnRateLimit?: boolean;
}

/**
 * Interface for RPC connection management
 */
export interface RpcConnectionManager {
  /** Get the current active connection */
  getConnection(): Connection;

  /** Report a successful RPC call (resets failure counter) */
  reportSuccess(): void;

  /** Report a failed RPC call (triggers failover if threshold reached) */
  reportFailure(error: Error): Promise<void>;

  /** Get the current endpoint URL */
  getCurrentEndpoint(): string;

  /** Switch to next available endpoint */
  switchToNextEndpoint(): Promise<void>;
}

/**
 * Interface for network mode management
 */
export interface NetworkModeManager {
  /** Get the current network mode */
  getNetworkMode(): NetworkMode;

  /** Set the network mode */
  setNetworkMode(mode: NetworkMode): void;

  /** Get configuration for a specific network */
  getNetworkConfig(mode: NetworkMode): NetworkConfig;
}

/**
 * Options for the withFallback wrapper
 */
export interface FallbackOptions {
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Delay between retries (ms) */
  retryDelay?: number;
}
