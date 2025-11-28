import { Connection } from "@solana/web3.js";
import { NetworkMode } from "./types";
import { NetworkManager } from "./networkManager";
import { ConnectionManager } from "./connectionManager";
import { DEFAULT_CONNECTION_OPTIONS } from "./config";

/**
 * Unified network provider that coordinates network and connection management
 *
 * This is the main entry point for network operations in the application.
 * It coordinates between the NetworkManager (network mode) and ConnectionManager (RPC connections).
 */
export class NetworkProvider {
  private networkManager: NetworkManager;
  private connectionManager: ConnectionManager;

  constructor() {
    this.networkManager = new NetworkManager();
    this.connectionManager = new ConnectionManager(
      this.networkManager.getNetworkMode(),
      DEFAULT_CONNECTION_OPTIONS
    );
  }

  /**
   * Get the current network mode
   */
  getNetworkMode(): NetworkMode {
    return this.networkManager.getNetworkMode();
  }

  /**
   * Set the network mode and update connections accordingly
   */
  setNetworkMode(mode: NetworkMode): void {
    const previousMode = this.networkManager.getNetworkMode();
    if (mode !== previousMode) {
      this.networkManager.setNetworkMode(mode);

      // Update connection manager with new endpoints
      const endpoints = this.networkManager.getCurrentEndpoints();
      this.connectionManager.setEndpoints(endpoints);
    }
  }

  /**
   * Get the current active RPC connection
   */
  getConnection(): Connection {
    return this.connectionManager.getConnection();
  }

  /**
   * Report a successful RPC call
   */
  reportSuccess(): void {
    this.connectionManager.reportSuccess();
  }

  /**
   * Report a failed RPC call
   */
  async reportFailure(error: Error): Promise<void> {
    await this.connectionManager.reportFailure(error);
  }

  /**
   * Get the current RPC endpoint URL
   */
  getCurrentEndpoint(): string {
    return this.connectionManager.getCurrentEndpoint();
  }

  /**
   * Execute an RPC operation with automatic failover
   *
   * This wrapper handles:
   * - Automatic retry on failure
   * - Failover between endpoints
   * - Success/failure reporting
   *
   * @param operation - The RPC operation to execute
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   * @returns The result of the operation
   */
  async withFallback<T>(
    operation: (connection: Connection) => Promise<T>,
    maxRetries = 3
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const connection = this.getConnection();
        const result = await operation(connection);
        this.reportSuccess();
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(
          `[RPC] Attempt ${attempt + 1} failed:`,
          lastError.message.slice(0, 100)
        );
        await this.reportFailure(lastError);

        // Small delay before retry
        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
    }

    throw lastError || new Error("RPC operation failed after retries");
  }
}

/**
 * Singleton instance for global access
 * This ensures consistent state across the application
 */
const networkProvider = new NetworkProvider();

export default networkProvider;
