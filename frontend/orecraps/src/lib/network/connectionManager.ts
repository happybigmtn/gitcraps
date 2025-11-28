import { Connection } from "@solana/web3.js";
import { createDebugger } from "@/lib/debug";
import {
  RpcConnectionManager,
  ConnectionOptions,
  NetworkMode,
} from "./types";
import { NETWORK_CONFIGS, DEFAULT_CONNECTION_OPTIONS, FAILOVER_CONFIG } from "./config";

const debug = createDebugger("ConnectionManager");

/**
 * Manages RPC connections with automatic failover support
 *
 * This class handles:
 * - Connection lifecycle management
 * - Automatic failover between endpoints
 * - Failure tracking and threshold-based switching
 * - Rate limit detection and fast failover
 */
export class ConnectionManager implements RpcConnectionManager {
  private endpoints: string[];
  private currentEndpointIndex = 0;
  private currentConnection: Connection | null = null;
  private consecutiveFailures = 0;
  private connectionOptions: ConnectionOptions;

  // Synchronization to prevent concurrent endpoint switches
  private isSwitching = false;
  private switchPromise: Promise<void> | null = null;

  constructor(
    networkMode: NetworkMode,
    options: ConnectionOptions = DEFAULT_CONNECTION_OPTIONS
  ) {
    const config = NETWORK_CONFIGS[networkMode];
    this.endpoints = config.endpoints;
    this.connectionOptions = options;

    if (this.endpoints.length === 0) {
      throw new Error(`No endpoints configured for network: ${networkMode}`);
    }

    debug(`Initialized for ${config.name} with ${this.endpoints.length} endpoints`);
  }

  /**
   * Get the current active connection
   * Creates a new connection if none exists
   */
  getConnection(): Connection {
    if (!this.currentConnection || this.currentEndpointIndex >= this.endpoints.length) {
      this.currentEndpointIndex = 0;
      this.currentConnection = new Connection(
        this.endpoints[this.currentEndpointIndex],
        this.connectionOptions
      );
    }
    return this.currentConnection;
  }

  /**
   * Report a successful RPC call
   * Resets the consecutive failure counter
   */
  reportSuccess(): void {
    this.consecutiveFailures = 0;
  }

  /**
   * Report a failed RPC call
   * Will trigger failover if failure threshold is reached
   */
  async reportFailure(error: Error): Promise<void> {
    this.consecutiveFailures++;

    const isRateLimited =
      error.message.includes("429") ||
      error.message.includes("rate limit") ||
      error.message.includes("Too Many Requests");

    // Switch faster on rate limits
    const threshold = isRateLimited
      ? FAILOVER_CONFIG.rateLimitThreshold
      : FAILOVER_CONFIG.failureThreshold;

    if (this.consecutiveFailures >= threshold) {
      await this.switchToNextEndpoint();
    }
  }

  /**
   * Get the current endpoint URL
   */
  getCurrentEndpoint(): string {
    return this.endpoints[this.currentEndpointIndex] || this.endpoints[0];
  }

  /**
   * Switch to the next available endpoint
   * Uses synchronization to prevent concurrent switches
   */
  async switchToNextEndpoint(): Promise<void> {
    // If already switching, wait for the current switch to complete
    if (this.isSwitching && this.switchPromise) {
      return this.switchPromise;
    }

    // Set synchronization flag and create switch promise
    this.isSwitching = true;
    this.switchPromise = (async () => {
      try {
        const nextIndex = (this.currentEndpointIndex + 1) % this.endpoints.length;
        await this.switchToEndpoint(nextIndex);
      } finally {
        // Clear synchronization flag and promise
        this.isSwitching = false;
        this.switchPromise = null;
      }
    })();

    return this.switchPromise;
  }

  /**
   * Switch to a specific endpoint by index
   */
  private async switchToEndpoint(index: number): Promise<void> {
    if (index === this.currentEndpointIndex && this.currentConnection) {
      return;
    }

    this.currentEndpointIndex = index;
    this.consecutiveFailures = 0;

    const endpoint = this.endpoints[this.currentEndpointIndex];
    debug(
      `Switching to endpoint ${this.currentEndpointIndex + 1}/${this.endpoints.length}: ${endpoint.slice(0, 50)}...`
    );

    this.currentConnection = new Connection(endpoint, this.connectionOptions);
  }

  /**
   * Reset the connection manager state
   * Useful when changing networks
   */
  reset(): void {
    this.currentEndpointIndex = 0;
    this.currentConnection = null;
    this.consecutiveFailures = 0;
    this.isSwitching = false;
    this.switchPromise = null;
  }

  /**
   * Update endpoints (useful when network changes)
   */
  setEndpoints(endpoints: string[]): void {
    if (endpoints.length === 0) {
      throw new Error("Cannot set empty endpoints list");
    }
    this.endpoints = endpoints;
    this.reset();
  }
}
