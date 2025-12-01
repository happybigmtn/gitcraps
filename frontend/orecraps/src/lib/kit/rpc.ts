/**
 * RPC Utilities for Anza Kit
 *
 * Provides RPC client creation and management using the new Kit architecture.
 * Supports both HTTP and WebSocket connections.
 */

import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  type Rpc,
  type RpcSubscriptions,
} from "@solana/kit";

// Default RPC endpoints
const DEVNET_RPC = "https://api.devnet.solana.com";
const MAINNET_RPC = "https://api.mainnet-beta.solana.com";
const LOCALNET_RPC = "http://127.0.0.1:8899";

// WebSocket endpoints
const DEVNET_WS = "wss://api.devnet.solana.com";
const MAINNET_WS = "wss://api.mainnet-beta.solana.com";
const LOCALNET_WS = "ws://127.0.0.1:8900";

export type Network = "devnet" | "mainnet-beta" | "localnet";

/**
 * Get the HTTP RPC endpoint for a network
 */
export function getRpcEndpoint(network: Network): string {
  switch (network) {
    case "devnet":
      return process.env.NEXT_PUBLIC_RPC_ENDPOINT || DEVNET_RPC;
    case "mainnet-beta":
      return process.env.NEXT_PUBLIC_RPC_ENDPOINT || MAINNET_RPC;
    case "localnet":
      return process.env.NEXT_PUBLIC_RPC_ENDPOINT || LOCALNET_RPC;
    default:
      return DEVNET_RPC;
  }
}

/**
 * Get the WebSocket endpoint for a network
 */
export function getWsEndpoint(network: Network): string {
  switch (network) {
    case "devnet":
      return process.env.NEXT_PUBLIC_WS_ENDPOINT || DEVNET_WS;
    case "mainnet-beta":
      return process.env.NEXT_PUBLIC_WS_ENDPOINT || MAINNET_WS;
    case "localnet":
      return process.env.NEXT_PUBLIC_WS_ENDPOINT || LOCALNET_WS;
    default:
      return DEVNET_WS;
  }
}

/**
 * Create an RPC client for the specified network
 */
export function createRpc(network: Network = "devnet"): Rpc<any> {
  const endpoint = getRpcEndpoint(network);
  return createSolanaRpc(endpoint);
}

/**
 * Create an RPC subscriptions client for the specified network
 */
export function createRpcSubscriptions(network: Network = "devnet"): RpcSubscriptions<any> {
  const endpoint = getWsEndpoint(network);
  return createSolanaRpcSubscriptions(endpoint);
}

// Singleton instances for convenience
let _rpc: Rpc<any> | null = null;
let _rpcSubscriptions: RpcSubscriptions<any> | null = null;
let _currentNetwork: Network | null = null;

/**
 * Get the singleton RPC client (creates one if needed)
 */
export function getRpc(network?: Network): Rpc<any> {
  const net = network || (process.env.NEXT_PUBLIC_SOLANA_NETWORK as Network) || "devnet";

  if (!_rpc || _currentNetwork !== net) {
    _rpc = createRpc(net);
    _currentNetwork = net;
  }

  return _rpc;
}

/**
 * Get the singleton RPC subscriptions client (creates one if needed)
 */
export function getRpcSubscriptions(network?: Network): RpcSubscriptions<any> {
  const net = network || (process.env.NEXT_PUBLIC_SOLANA_NETWORK as Network) || "devnet";

  if (!_rpcSubscriptions || _currentNetwork !== net) {
    _rpcSubscriptions = createRpcSubscriptions(net);
  }

  return _rpcSubscriptions;
}
