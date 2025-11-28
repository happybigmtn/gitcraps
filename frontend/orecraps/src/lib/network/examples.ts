/**
 * Example usage patterns for the Network Abstraction Layer
 *
 * This file demonstrates common use cases and patterns.
 * These examples are for reference only and are not executed.
 */

import { PublicKey } from "@solana/web3.js";
import {
  getConnection,
  setNetworkMode,
  getNetworkMode,
  getCurrentEndpoint,
  withFallback,
  reportSuccess,
  reportFailure,
} from "@/lib/network";

/**
 * Example 1: Basic connection usage
 */
export async function basicConnectionExample() {
  // Get the current connection
  const connection = getConnection();

  // Use it directly for simple calls
  const slot = await connection.getSlot();
  console.log(`Current slot: ${slot}`);
}

/**
 * Example 2: Using withFallback for automatic retry
 */
export async function withFallbackExample(publicKey: PublicKey) {
  // The recommended way - automatic failover and retry
  const balance = await withFallback(async (connection) => {
    return connection.getBalance(publicKey);
  });

  console.log(`Balance: ${balance} lamports`);
}

/**
 * Example 3: Fetching multiple accounts in parallel
 */
export async function parallelFetchExample(addresses: PublicKey[]) {
  const accounts = await withFallback(async (connection) => {
    // Fetch all accounts in parallel
    return Promise.all(
      addresses.map((address) => connection.getAccountInfo(address))
    );
  });

  return accounts;
}

/**
 * Example 4: Network switching
 */
export async function networkSwitchExample() {
  // Check current network
  const currentNetwork = getNetworkMode();
  console.log(`Current network: ${currentNetwork}`);

  // Switch to localnet for development
  setNetworkMode("localnet");

  // Switch back to devnet
  setNetworkMode("devnet");
}

/**
 * Example 5: Manual error handling (advanced)
 */
export async function manualErrorHandlingExample(publicKey: PublicKey) {
  try {
    const connection = getConnection();
    const accountInfo = await connection.getAccountInfo(publicKey);

    // Important: Report success to reset failure counter
    reportSuccess();

    return accountInfo;
  } catch (error) {
    // Report failure - may trigger automatic failover
    await reportFailure(error as Error);

    // Re-throw or handle the error
    throw error;
  }
}

/**
 * Example 6: Custom retry logic
 */
export async function customRetryExample(publicKey: PublicKey) {
  // Use more retries for critical operations
  const result = await withFallback(
    async (connection) => {
      return connection.getAccountInfo(publicKey);
    },
    5 // retry up to 5 times instead of default 3
  );

  return result;
}

/**
 * Example 7: Debugging connection issues
 */
export async function debugConnectionExample() {
  // Get current endpoint for logging
  const endpoint = getCurrentEndpoint();
  console.log(`Using RPC endpoint: ${endpoint}`);

  // Get network info
  const network = getNetworkMode();
  console.log(`Connected to: ${network}`);

  // Try a simple call to test connectivity
  await withFallback(async (connection) => {
    const version = await connection.getVersion();
    console.log(`Solana version:`, version);
    return version;
  });
}

/**
 * Example 8: Using in React hooks
 */
export function useBlockchainDataExample() {
  // This is a simplified example - in real code, use useCallback, useEffect, etc.
  const fetchData = async (address: PublicKey) => {
    // Always use withFallback in hooks for reliability
    const accountInfo = await withFallback(async (connection) => {
      return connection.getAccountInfo(address);
    });

    return accountInfo;
  };

  return { fetchData };
}

/**
 * Example 9: Batch operations with error handling
 */
export async function batchOperationsExample(addresses: PublicKey[]) {
  const results = [];
  const errors = [];

  for (const address of addresses) {
    try {
      const account = await withFallback(async (connection) => {
        return connection.getAccountInfo(address);
      });
      results.push({ address, account });
    } catch (error) {
      errors.push({ address, error });
    }
  }

  return { results, errors };
}

/**
 * Example 10: Transaction signing and sending
 */
export async function sendTransactionExample(
  signedTransaction: Buffer
): Promise<string> {
  const signature = await withFallback(
    async (connection) => {
      return connection.sendRawTransaction(signedTransaction, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
    },
    5 // More retries for transactions
  );

  // Wait for confirmation
  await withFallback(async (connection) => {
    return connection.confirmTransaction(signature, "confirmed");
  });

  return signature;
}
