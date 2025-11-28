/**
 * Secure Admin Keypair Management
 *
 * This module provides centralized, secure access to the admin keypair for API routes.
 * The keypair is loaded from an environment variable (base58 encoded secret key) to
 * prevent accidental exposure of filesystem paths and ensure proper secret management.
 *
 * SECURITY REQUIREMENTS:
 * - ADMIN_KEYPAIR environment variable must be set (base58 encoded secret key)
 * - No filesystem path fallbacks (prevents accidental exposure)
 * - Production environment check to prevent mistakes
 * - Keypair is cached after first load for performance
 *
 * Usage:
 * ```typescript
 * import { getAdminKeypair } from '@/lib/adminKeypair';
 *
 * const admin = getAdminKeypair();
 * ```
 */

import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

// Cache the keypair after first load
let cachedKeypair: Keypair | null = null;

/**
 * Load and return the admin keypair
 *
 * @throws {Error} If ADMIN_KEYPAIR env var is not set
 * @throws {Error} If the keypair is invalid or cannot be decoded
 * @throws {Error} If attempted to use in production without proper setup
 * @returns {Keypair} The admin keypair
 */
export function getAdminKeypair(): Keypair {
  // Return cached keypair if available
  if (cachedKeypair) {
    return cachedKeypair;
  }

  // Production safety check
  if (process.env.NODE_ENV === "production" && !process.env.ADMIN_KEYPAIR) {
    throw new Error(
      "ADMIN_KEYPAIR environment variable is required in production. " +
      "This must be a base58 encoded secret key, never a file path."
    );
  }

  // Get the base58 encoded secret key from environment
  const adminKeypairBase58 = process.env.ADMIN_KEYPAIR;

  if (!adminKeypairBase58) {
    throw new Error(
      "ADMIN_KEYPAIR environment variable is not set. " +
      "Please set ADMIN_KEYPAIR to a base58 encoded secret key. " +
      "For localnet testing, you can export the key from your Solana config: " +
      "cat ~/.config/solana/id.json | jq -r '[.[]] | @json' | xargs -I {} solana-keygen pubkey --keypair <(echo {})"
    );
  }

  try {
    // Decode the base58 secret key
    const secretKey = bs58.decode(adminKeypairBase58);

    // Validate the secret key length (should be 64 bytes for Ed25519)
    if (secretKey.length !== 64) {
      throw new Error(
        `Invalid secret key length: expected 64 bytes, got ${secretKey.length}. ` +
        "Ensure ADMIN_KEYPAIR is a valid base58 encoded Ed25519 secret key."
      );
    }

    // Create and cache the keypair
    cachedKeypair = Keypair.fromSecretKey(secretKey);

    return cachedKeypair;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to decode ADMIN_KEYPAIR: ${error.message}. ` +
        "Ensure the environment variable contains a valid base58 encoded secret key."
      );
    }
    throw error;
  }
}
