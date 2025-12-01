/**
 * Anza Kit Integration Layer
 *
 * This module provides the new @solana/kit APIs alongside compatibility
 * helpers for gradual migration from @solana/web3.js 1.x
 */

// Core Kit exports
export {
  address,
  getAddressCodec,
  getAddressDecoder,
  getAddressEncoder,
  isAddress,
  type Address,
} from "@solana/kit";

export {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  type Rpc,
  type RpcSubscriptions,
} from "@solana/kit";

export {
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  compileTransaction,
  type TransactionMessage,
  type CompiledTransactionMessage,
} from "@solana/kit";

export {
  signTransactionMessageWithSigners,
  type TransactionSigner,
} from "@solana/kit";

export {
  sendAndConfirmTransactionFactory,
  getSignatureFromTransaction,
} from "@solana/kit";

export {
  getProgramDerivedAddress,
  type ProgramDerivedAddress,
} from "@solana/kit";

// Compat layer exports for migration
export {
  fromLegacyPublicKey,
  fromLegacyKeypair,
  fromVersionedTransaction,
} from "@solana/compat";

// Helper to convert Kit Address back to legacy PublicKey
// Note: @solana/compat doesn't provide this, so we create our own
import { PublicKey } from "@solana/web3.js";

export function toLegacyPublicKey(address: string): PublicKey {
  return new PublicKey(address);
}

// Re-export commonly used types
export type {
  Blockhash,
  Slot,
  Lamports,
  UnixTimestamp,
} from "@solana/kit";
