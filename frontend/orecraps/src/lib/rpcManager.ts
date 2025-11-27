import { Connection, clusterApiUrl } from "@solana/web3.js";
import { createDebugger } from "@/lib/debug";

const debug = createDebugger("RPC");

export type NetworkMode = "localnet" | "devnet";

// RPC endpoints per network
const NETWORK_ENDPOINTS: Record<NetworkMode, string[]> = {
  localnet: [
    "http://127.0.0.1:8899",
    "http://localhost:8899",
  ],
  devnet: [
    process.env.NEXT_PUBLIC_RPC_ENDPOINT || "",
    "https://api.devnet.solana.com",
    "https://devnet.genesysgo.net",
    clusterApiUrl("devnet"),
  ].filter(Boolean),
};

// Current network mode
let currentNetwork: NetworkMode = "devnet";

// Get endpoints for current network
function getRpcEndpoints(): string[] {
  return NETWORK_ENDPOINTS[currentNetwork];
}

// Track the current endpoint index and connection
let currentEndpointIndex = 0;
let currentConnection: Connection | null = null;
let lastSuccessTime = 0;
let consecutiveFailures = 0;

// Constants
const FAILURE_THRESHOLD = 3; // Switch after 3 consecutive failures
const SUCCESS_RESET_TIME = 30000; // Reset to primary after 30s of success

/**
 * Set the current network mode
 */
export function setNetworkMode(network: NetworkMode): void {
  if (network !== currentNetwork) {
    currentNetwork = network;
    currentEndpointIndex = 0;
    currentConnection = null;
    consecutiveFailures = 0;
    debug(`Switched to ${network}`);
  }
}

/**
 * Get current network mode
 */
export function getNetworkMode(): NetworkMode {
  return currentNetwork;
}

/**
 * Get the current best RPC connection
 * Automatically handles failover between endpoints
 */
export function getConnection(): Connection {
  const endpoints = getRpcEndpoints();
  if (!currentConnection || currentEndpointIndex >= endpoints.length) {
    currentEndpointIndex = 0;
    currentConnection = new Connection(endpoints[currentEndpointIndex], {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 60000,
      disableRetryOnRateLimit: true, // We handle retries ourselves
    });
  }
  return currentConnection;
}

/**
 * Report a successful RPC call
 */
export function reportSuccess(): void {
  consecutiveFailures = 0;
  lastSuccessTime = Date.now();
}

/**
 * Report a failed RPC call - will switch to fallback after threshold
 */
export function reportFailure(error: Error): void {
  consecutiveFailures++;
  
  const isRateLimited = error.message.includes("429") || 
                        error.message.includes("rate limit") ||
                        error.message.includes("Too Many Requests");
  
  // Switch faster on rate limits
  const threshold = isRateLimited ? 1 : FAILURE_THRESHOLD;
  
  if (consecutiveFailures >= threshold) {
    switchToNextEndpoint();
  }
}

/**
 * Switch to the next available endpoint
 */
function switchToNextEndpoint(): void {
  const endpoints = getRpcEndpoints();
  const nextIndex = (currentEndpointIndex + 1) % endpoints.length;
  switchToEndpoint(nextIndex);
}

/**
 * Switch to a specific endpoint index
 */
function switchToEndpoint(index: number): void {
  const endpoints = getRpcEndpoints();
  if (index === currentEndpointIndex && currentConnection) {
    return;
  }

  currentEndpointIndex = index;
  consecutiveFailures = 0;

  const endpoint = endpoints[currentEndpointIndex];
  debug(`Switching to endpoint ${currentEndpointIndex + 1}/${endpoints.length}: ${endpoint.slice(0, 50)}...`);

  currentConnection = new Connection(endpoint, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60000,
    disableRetryOnRateLimit: true,
  });
}

/**
 * Get the current endpoint URL (for debugging)
 */
export function getCurrentEndpoint(): string {
  const endpoints = getRpcEndpoints();
  return endpoints[currentEndpointIndex] || endpoints[0];
}

/**
 * Wrapper for RPC calls that handles automatic failover
 */
export async function withFallback<T>(
  operation: (connection: Connection) => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const connection = getConnection();
      const result = await operation(connection);
      reportSuccess();
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn("[RPC] Attempt " + (attempt + 1) + " failed:", lastError.message.slice(0, 100));
      reportFailure(lastError);
      
      // Small delay before retry
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }
  
  throw lastError || new Error("RPC operation failed after retries");
}
