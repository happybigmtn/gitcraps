import { NetworkMode, NetworkConfig, NetworkModeManager } from "./types";
import { NETWORK_CONFIGS } from "./config";
import { createDebugger } from "@/lib/debug";

const debug = createDebugger("NetworkManager");

/**
 * Manages network mode state
 *
 * This class handles:
 * - Current network mode tracking
 * - Network configuration retrieval
 * - Network mode validation
 */
export class NetworkManager implements NetworkModeManager {
  private currentNetwork: NetworkMode = "devnet";

  /**
   * Get the current network mode
   */
  getNetworkMode(): NetworkMode {
    return this.currentNetwork;
  }

  /**
   * Set the network mode
   */
  setNetworkMode(mode: NetworkMode): void {
    if (mode !== this.currentNetwork) {
      this.currentNetwork = mode;
      debug(`Switched to ${mode}`);
    }
  }

  /**
   * Get configuration for a specific network
   */
  getNetworkConfig(mode: NetworkMode): NetworkConfig {
    const config = NETWORK_CONFIGS[mode];
    if (!config) {
      throw new Error(`Unknown network mode: ${mode}`);
    }
    return config;
  }

  /**
   * Get endpoints for the current network
   */
  getCurrentEndpoints(): string[] {
    return this.getNetworkConfig(this.currentNetwork).endpoints;
  }
}
