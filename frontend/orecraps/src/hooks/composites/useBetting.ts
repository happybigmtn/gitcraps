"use client";

import { useCallback, useState, useMemo } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction, TransactionInstruction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { toast } from "sonner";
import { useCraps, CrapsState } from "../useCraps";
import { useTransaction } from "../useTransaction";
import {
  CrapsBetType,
  createPlaceCrapsBetInstruction,
  createClaimCrapsWinningsInstruction,
  CrapsGame,
  CrapsPosition,
} from "@/lib/program";

/**
 * Represents a pending bet to be placed
 */
export interface PendingBet {
  betType: CrapsBetType;
  point: number;
  amount: number; // in SOL
}

/**
 * Options for placing a bet
 */
export interface PlaceBetOptions {
  betType: CrapsBetType;
  point?: number;
  amount: number; // in SOL
}

/**
 * Composite hook that combines wallet, bet placement, and craps state
 *
 * This hook reduces coupling by providing a unified interface for betting
 * operations. Components can use this instead of importing multiple hooks
 * and managing wallet/transaction state separately.
 *
 * @returns Combined betting state and operations
 *
 * @example
 * ```tsx
 * function BettingComponent() {
 *   const {
 *     isConnected,
 *     game,
 *     position,
 *     canPlaceBet,
 *     placeBet,
 *     placeBets,
 *     claimWinnings,
 *     isSubmitting,
 *   } = useBetting();
 *
 *   const handleBet = async () => {
 *     await placeBet({
 *       betType: CrapsBetType.PassLine,
 *       amount: 1.0,
 *     });
 *   };
 *
 *   return <button onClick={handleBet} disabled={!canPlaceBet(CrapsBetType.PassLine)}>
 *     Place Bet
 *   </button>;
 * }
 * ```
 */
export function useBetting() {
  // Individual hooks (re-exported for backward compatibility)
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const {
    game,
    position,
    loading: crapsLoading,
    error: crapsError,
    refetch: refetchCraps,
    isComeOut,
    currentPoint,
    epochId,
    houseBankroll,
    pendingWinnings,
  } = useCraps();
  const { isLoading: txLoading } = useTransaction();

  // Local state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  // Computed convenience values
  const isConnected = useMemo(() => connected && publicKey !== null, [connected, publicKey]);

  const hasPosition = useMemo(() => position !== null, [position]);

  const hasPendingWinnings = useMemo(() => pendingWinnings > 0n, [pendingWinnings]);

  const houseBankrollSOL = useMemo(() => {
    return game ? Number(game.houseBankroll) / LAMPORTS_PER_SOL : 0;
  }, [game]);

  const pendingWinningsSOL = useMemo(() => {
    return Number(pendingWinnings) / LAMPORTS_PER_SOL;
  }, [pendingWinnings]);

  /**
   * Check if a bet type can be placed based on current game state
   * @param betType - The type of bet to check
   * @returns true if the bet can be placed, false otherwise
   */
  const canPlaceBet = useCallback(
    (betType: CrapsBetType): boolean => {
      if (!game || !isConnected) return false;

      const hasPassLine = (position?.passLine ?? 0n) > 0n;
      const hasDontPass = (position?.dontPass ?? 0n) > 0n;

      switch (betType) {
        case CrapsBetType.PassLine:
        case CrapsBetType.DontPass:
          return isComeOut;
        case CrapsBetType.PassOdds:
          return !isComeOut && currentPoint !== 0 && hasPassLine;
        case CrapsBetType.DontPassOdds:
          return !isComeOut && currentPoint !== 0 && hasDontPass;
        default:
          return true;
      }
    },
    [game, position, isComeOut, currentPoint, isConnected]
  );

  /**
   * Place a single bet
   * @param options - Bet placement options
   * @returns Transaction signature or null if failed
   */
  const placeBet = useCallback(
    async (options: PlaceBetOptions): Promise<string | null> => {
      if (!publicKey || !isConnected) {
        toast.error("Please connect your wallet first");
        return null;
      }

      if (!canPlaceBet(options.betType)) {
        toast.error("This bet type cannot be placed at this time");
        return null;
      }

      try {
        setIsSubmitting(true);
        toast.info("Preparing transaction...");

        const amountLamports = BigInt(Math.floor(options.amount * LAMPORTS_PER_SOL));
        const ix = createPlaceCrapsBetInstruction(
          publicKey,
          options.betType,
          options.point ?? 0,
          amountLamports
        );

        const transaction = new Transaction().add(ix);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = publicKey;

        toast.info("Please confirm in your wallet...");
        const signature = await sendTransaction(transaction, connection);

        // Validate signature
        if (!signature || typeof signature !== "string" || signature.length === 0) {
          throw new Error("Invalid transaction signature received");
        }

        toast.info("Confirming transaction...");
        await connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight,
        });

        toast.success("Bet placed successfully!");
        refetchCraps();
        return signature;
      } catch (error) {
        console.error("Place bet error:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        if (errorMessage.includes("User rejected")) {
          toast.error("Transaction cancelled");
        } else {
          toast.error(`Failed to place bet: ${errorMessage}`);
        }
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    [publicKey, isConnected, canPlaceBet, connection, sendTransaction, refetchCraps]
  );

  /**
   * Place multiple bets in a single transaction
   * @param bets - Array of bets to place
   * @returns Transaction signature or null if failed
   */
  const placeBets = useCallback(
    async (bets: PendingBet[]): Promise<string | null> => {
      if (!publicKey || !isConnected) {
        toast.error("Please connect your wallet first");
        return null;
      }

      if (bets.length === 0) {
        toast.error("No bets to submit");
        return null;
      }

      try {
        setIsSubmitting(true);
        toast.info("Preparing transaction...");

        const transaction = new Transaction();

        // Add all pending bets as instructions
        for (const bet of bets) {
          const amountLamports = BigInt(Math.floor(bet.amount * LAMPORTS_PER_SOL));
          const ix = createPlaceCrapsBetInstruction(
            publicKey,
            bet.betType,
            bet.point,
            amountLamports
          );
          transaction.add(ix);
        }

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = publicKey;

        toast.info("Please confirm in your wallet...");
        const signature = await sendTransaction(transaction, connection);

        // Validate signature
        if (!signature || typeof signature !== "string" || signature.length === 0) {
          throw new Error("Invalid transaction signature received");
        }

        toast.info("Confirming transaction...");
        await connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight,
        });

        toast.success(`Placed ${bets.length} bet(s) successfully!`);
        refetchCraps();
        return signature;
      } catch (error) {
        console.error("Place bets error:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        if (errorMessage.includes("User rejected")) {
          toast.error("Transaction cancelled");
        } else {
          toast.error(`Failed to place bets: ${errorMessage}`);
        }
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    [publicKey, isConnected, connection, sendTransaction, refetchCraps]
  );

  /**
   * Claim pending winnings
   * @returns Transaction signature or null if failed
   */
  const claimWinnings = useCallback(async (): Promise<string | null> => {
    if (!publicKey || !isConnected) {
      toast.error("Please connect your wallet first");
      return null;
    }

    if (pendingWinnings === 0n) {
      toast.error("No winnings to claim");
      return null;
    }

    try {
      setIsClaiming(true);
      toast.info("Preparing claim...");

      const ix = createClaimCrapsWinningsInstruction(publicKey);
      const transaction = new Transaction().add(ix);

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      toast.info("Please confirm in your wallet...");
      const signature = await sendTransaction(transaction, connection);

      // Validate signature
      if (!signature || typeof signature !== "string" || signature.length === 0) {
        throw new Error("Invalid transaction signature received");
      }

      toast.info("Confirming transaction...");
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });

      const winAmount = Number(pendingWinnings) / LAMPORTS_PER_SOL;
      toast.success(`Claimed ${winAmount.toFixed(4)} SOL!`);
      refetchCraps();
      return signature;
    } catch (error) {
      console.error("Claim error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      if (errorMessage.includes("User rejected")) {
        toast.error("Transaction cancelled");
      } else {
        toast.error(`Failed to claim: ${errorMessage}`);
      }
      return null;
    } finally {
      setIsClaiming(false);
    }
  }, [publicKey, isConnected, pendingWinnings, connection, sendTransaction, refetchCraps]);

  /**
   * Submit a custom transaction instruction
   * @param instructions - Array of transaction instructions
   * @param successMessage - Optional success message
   * @returns Transaction signature or null if failed
   */
  const submitTransaction = useCallback(
    async (
      instructions: TransactionInstruction[],
      successMessage?: string
    ): Promise<string | null> => {
      if (!publicKey || !isConnected) {
        toast.error("Wallet not connected");
        return null;
      }

      setIsSubmitting(true);

      try {
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

        const tx = new Transaction().add(...instructions);
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;

        const signature = await sendTransaction(tx, connection);

        if (!signature) {
          throw new Error("No signature returned");
        }

        await connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight,
        });

        toast.success(successMessage || "Transaction confirmed!");
        refetchCraps();
        return signature;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Transaction failed";
        toast.error(message);
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    [connection, publicKey, sendTransaction, isConnected, refetchCraps]
  );

  return {
    // Raw state (for backward compatibility)
    publicKey,
    connected,
    game,
    position,
    crapsLoading,
    crapsError,
    isComeOut,
    currentPoint,
    epochId,
    houseBankroll,
    pendingWinnings,

    // Computed convenience values
    isConnected,
    hasPosition,
    hasPendingWinnings,
    houseBankrollSOL,
    pendingWinningsSOL,
    isSubmitting: isSubmitting || txLoading,
    isClaiming,

    // Utility methods
    canPlaceBet,
    placeBet,
    placeBets,
    claimWinnings,
    submitTransaction,
    refetch: refetchCraps,
  };
}

/**
 * Type export for components that want to type their props
 */
export type BettingSession = ReturnType<typeof useBetting>;

// Re-export types for convenience
export type { CrapsGame, CrapsPosition, CrapsState, CrapsBetType };
