/**
 * Centralized Program ID Configuration - Migrated for Anza Kit compatibility
 *
 * All program IDs are centralized here to avoid duplication across the codebase.
 * Environment variables can be used to override defaults for different deployments.
 *
 * Uses legacy PublicKey for constants that are consumed by legacy APIs.
 * For Kit Address types, use toKitAddress() from lib/solana.
 */

import { PublicKey } from '@solana/web3.js';

export const ORE_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_ORE_PROGRAM_ID ||
  "JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK"
);

export const ENTROPY_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_ENTROPY_PROGRAM_ID ||
  "3jSkUuYBoJzQPMEzTvkDFXCZUBksPamrVhrnHR9igu2X"
);

export const TOKEN_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_TOKEN_MINT ||
  "oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp"
);

export const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
