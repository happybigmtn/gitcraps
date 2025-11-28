/**
 * Network Abstraction Layer
 *
 * This module provides a clean separation of concerns for network and RPC management:
 *
 * ## Architecture
 *
 * - **Types** (`types.ts`): Core type definitions and interfaces
 * - **Config** (`config.ts`): Network configurations and constants
 * - **NetworkManager** (`networkManager.ts`): Manages network mode state
 * - **ConnectionManager** (`connectionManager.ts`): Manages RPC connections with failover
 * - **NetworkProvider** (`provider.ts`): Unified API that coordinates both managers
 *
 * ## Usage
 *
 * ### Basic Connection Usage
 * ```typescript
 * import { getConnection, withFallback } from '@/lib/network';
 *
 * // Get current connection
 * const connection = getConnection();
 *
 * // Execute with automatic failover
 * const balance = await withFallback(async (conn) => {
 *   return conn.getBalance(publicKey);
 * });
 * ```
 *
 * ### Network Switching
 * ```typescript
 * import { setNetworkMode, getNetworkMode } from '@/lib/network';
 *
 * // Switch networks
 * setNetworkMode('localnet');
 *
 * // Check current network
 * const current = getNetworkMode(); // 'localnet'
 * ```
 *
 * ### Manual Error Handling
 * ```typescript
 * import { getConnection, reportSuccess, reportFailure } from '@/lib/network';
 *
 * try {
 *   const connection = getConnection();
 *   const result = await connection.getAccountInfo(address);
 *   reportSuccess();
 *   return result;
 * } catch (error) {
 *   await reportFailure(error as Error);
 *   throw error;
 * }
 * ```
 *
 * ## Features
 *
 * - Automatic failover between RPC endpoints
 * - Rate limit detection and fast failover
 * - Thread-safe endpoint switching
 * - Configurable retry logic
 * - Debug logging support
 * - Type-safe interfaces
 */

import { Connection } from "@solana/web3.js";
import networkProvider from "./provider";

// Re-export types for convenience
export type { NetworkMode, NetworkConfig, FallbackOptions } from "./types";
export { NETWORK_CONFIGS, FAILOVER_CONFIG } from "./config";

/**
 * Get the current network mode
 *
 * @returns The current network mode ('localnet' | 'devnet')
 *
 * @example
 * ```typescript
 * const network = getNetworkMode();
 * console.log(`Connected to: ${network}`);
 * ```
 */
export function getNetworkMode() {
  return networkProvider.getNetworkMode();
}

/**
 * Set the current network mode
 *
 * This will reset the connection and switch to the new network's endpoints.
 *
 * @param mode - The network mode to switch to
 *
 * @example
 * ```typescript
 * setNetworkMode('localnet');
 * ```
 */
export function setNetworkMode(mode: "localnet" | "devnet") {
  networkProvider.setNetworkMode(mode);
}

/**
 * Get the current active RPC connection
 *
 * Returns a Solana Web3.js Connection instance configured for the current network.
 *
 * @returns The current Connection instance
 *
 * @example
 * ```typescript
 * const connection = getConnection();
 * const slot = await connection.getSlot();
 * ```
 */
export function getConnection(): Connection {
  return networkProvider.getConnection();
}

/**
 * Get the current RPC endpoint URL
 *
 * Useful for debugging and displaying which endpoint is currently active.
 *
 * @returns The current endpoint URL
 *
 * @example
 * ```typescript
 * const endpoint = getCurrentEndpoint();
 * console.log(`Using RPC: ${endpoint}`);
 * ```
 */
export function getCurrentEndpoint(): string {
  return networkProvider.getCurrentEndpoint();
}

/**
 * Report a successful RPC call
 *
 * This resets the failure counter, preventing unnecessary failover.
 * The `withFallback` wrapper calls this automatically.
 *
 * @example
 * ```typescript
 * try {
 *   const result = await connection.getAccountInfo(address);
 *   reportSuccess();
 *   return result;
 * } catch (error) {
 *   // handle error
 * }
 * ```
 */
export function reportSuccess(): void {
  networkProvider.reportSuccess();
}

/**
 * Report a failed RPC call
 *
 * This increments the failure counter and may trigger automatic failover
 * to the next endpoint if the threshold is reached.
 * The `withFallback` wrapper calls this automatically.
 *
 * @param error - The error that occurred
 *
 * @example
 * ```typescript
 * try {
 *   const result = await connection.getAccountInfo(address);
 *   return result;
 * } catch (error) {
 *   await reportFailure(error as Error);
 *   throw error;
 * }
 * ```
 */
export async function reportFailure(error: Error): Promise<void> {
  await networkProvider.reportFailure(error);
}

/**
 * Execute an RPC operation with automatic failover and retry
 *
 * This is the recommended way to make RPC calls. It handles:
 * - Automatic retry on failure
 * - Failover between endpoints
 * - Success/failure reporting
 * - Rate limit detection
 *
 * @param operation - Function that performs the RPC operation
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns The result of the operation
 * @throws The last error if all retries fail
 *
 * @example
 * ```typescript
 * // Fetch account balance with automatic failover
 * const balance = await withFallback(async (connection) => {
 *   return connection.getBalance(publicKey);
 * });
 *
 * // Fetch multiple accounts in parallel
 * const accounts = await withFallback(async (connection) => {
 *   return Promise.all([
 *     connection.getAccountInfo(address1),
 *     connection.getAccountInfo(address2),
 *   ]);
 * });
 *
 * // Custom retry count
 * const result = await withFallback(async (connection) => {
 *   return connection.getSlot();
 * }, 5); // retry up to 5 times
 * ```
 */
export async function withFallback<T>(
  operation: (connection: Connection) => Promise<T>,
  maxRetries = 3
): Promise<T> {
  return networkProvider.withFallback(operation, maxRetries);
}

/**
 * Direct access to the NetworkProvider instance
 *
 * Use this if you need more advanced control or want to extend functionality.
 *
 * @example
 * ```typescript
 * import { provider } from '@/lib/network';
 *
 * const connection = provider.getConnection();
 * ```
 */
export { networkProvider as provider };
