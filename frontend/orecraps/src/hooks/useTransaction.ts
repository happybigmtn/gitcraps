"use client";

/**
 * useTransaction Hook - Migrated for Anza Kit compatibility
 *
 * This hook provides transaction submission functionality.
 * Uses wallet adapter for signing and legacy web3.js Transaction types.
 * Kit types are exposed via re-exports from solana.ts.
 */

import { useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, TransactionInstruction } from '@solana/web3.js';
import { toast } from 'sonner';
import { type Address, toKitAddress } from '@/lib/solana';

interface UseTransactionOptions {
  onSuccess?: (signature: string) => void;
  onError?: (error: Error) => void;
}

export function useTransaction(options: UseTransactionOptions = {}) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitTransaction = useCallback(async (
    instructions: TransactionInstruction[],
    successMessage?: string
  ): Promise<string | null> => {
    if (!publicKey) {
      toast.error('Wallet not connected');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

      const tx = new Transaction().add(...instructions);
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      // Use signTransaction + sendRawTransaction to avoid cross-origin iframe issues
      if (!signTransaction) {
        throw new Error('Wallet does not support signTransaction');
      }

      const signedTx = await signTransaction(tx);
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      if (!signature) {
        throw new Error('No signature returned');
      }

      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });

      toast.success(successMessage || 'Transaction confirmed!');
      options.onSuccess?.(signature);
      return signature;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transaction failed';
      setError(message);
      toast.error(message);
      options.onError?.(err instanceof Error ? err : new Error(message));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [connection, publicKey, signTransaction, options]);

  // Get wallet address as Kit Address type for compatibility
  const walletAddress: Address | null = publicKey ? toKitAddress(publicKey) : null;

  return {
    submitTransaction,
    isLoading,
    error,
    // Kit-compatible address
    walletAddress,
  };
}

export default useTransaction;

// Re-export Kit types for convenience
export { type Address } from '@/lib/solana';
