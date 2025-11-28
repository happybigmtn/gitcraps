/**
 * Shared API route middleware and validation utilities.
 */

import { NextResponse } from "next/server";

/**
 * Validates that the current network is localnet.
 * Returns an error response if not localnet, or null if valid.
 */
export function validateLocalnetOnly(): NextResponse | null {
  const network = process.env.SOLANA_NETWORK || "localnet";
  const isLocalnet = network === "localnet";

  if (!isLocalnet) {
    return NextResponse.json(
      { error: "This endpoint is disabled in production" },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Check if we're running on localnet.
 */
export function isLocalnet(): boolean {
  const network = process.env.SOLANA_NETWORK || "localnet";
  return network === "localnet";
}
