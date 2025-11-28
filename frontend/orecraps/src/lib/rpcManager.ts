/**
 * RPC Manager - Legacy Compatibility Layer
 *
 * This file maintains backward compatibility with the old rpcManager API.
 * All functionality has been moved to the new network abstraction layer at @/lib/network.
 *
 * @deprecated Use @/lib/network instead for new code
 * @see /src/lib/network/index.ts
 */

import { Connection } from "@solana/web3.js";
import {
  getConnection as getNetworkConnection,
  setNetworkMode as setNetworkModeImpl,
  getNetworkMode as getNetworkModeImpl,
  getCurrentEndpoint as getCurrentEndpointImpl,
  reportSuccess as reportSuccessImpl,
  reportFailure as reportFailureImpl,
  withFallback as withFallbackImpl,
} from "@/lib/network";

// Re-export NetworkMode type for backward compatibility
export type { NetworkMode } from "@/lib/network";

/**
 * Set the current network mode
 *
 * @deprecated Use setNetworkMode from @/lib/network instead
 */
export function setNetworkMode(network: "localnet" | "devnet"): void {
  console.warn(
    "DEPRECATED: rpcManager.setNetworkMode() is deprecated. Use setNetworkMode from @/lib/network instead."
  );
  setNetworkModeImpl(network);
}

/**
 * Get current network mode
 *
 * @deprecated Use getNetworkMode from @/lib/network instead
 */
export function getNetworkMode(): "localnet" | "devnet" {
  console.warn(
    "DEPRECATED: rpcManager.getNetworkMode() is deprecated. Use getNetworkMode from @/lib/network instead."
  );
  return getNetworkModeImpl();
}

/**
 * Get the current best RPC connection
 * Automatically handles failover between endpoints
 *
 * @deprecated Use getConnection from @/lib/network instead
 */
export function getConnection(): Connection {
  console.warn(
    "DEPRECATED: rpcManager.getConnection() is deprecated. Use getConnection from @/lib/network instead."
  );
  return getNetworkConnection();
}

/**
 * Report a successful RPC call
 *
 * @deprecated Use reportSuccess from @/lib/network instead
 */
export function reportSuccess(): void {
  console.warn(
    "DEPRECATED: rpcManager.reportSuccess() is deprecated. Use reportSuccess from @/lib/network instead."
  );
  reportSuccessImpl();
}

/**
 * Report a failed RPC call - will switch to fallback after threshold
 *
 * @deprecated Use reportFailure from @/lib/network instead
 */
export async function reportFailure(error: Error): Promise<void> {
  console.warn(
    "DEPRECATED: rpcManager.reportFailure() is deprecated. Use reportFailure from @/lib/network instead."
  );
  await reportFailureImpl(error);
}

/**
 * Get the current endpoint URL (for debugging)
 *
 * @deprecated Use getCurrentEndpoint from @/lib/network instead
 */
export function getCurrentEndpoint(): string {
  console.warn(
    "DEPRECATED: rpcManager.getCurrentEndpoint() is deprecated. Use getCurrentEndpoint from @/lib/network instead."
  );
  return getCurrentEndpointImpl();
}

/**
 * Wrapper for RPC calls that handles automatic failover
 *
 * @deprecated Use withFallback from @/lib/network instead
 */
export async function withFallback<T>(
  operation: (connection: Connection) => Promise<T>,
  maxRetries = 3
): Promise<T> {
  console.warn(
    "DEPRECATED: rpcManager.withFallback() is deprecated. Use withFallback from @/lib/network instead."
  );
  return withFallbackImpl(operation, maxRetries);
}
