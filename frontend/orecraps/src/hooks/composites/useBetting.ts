"use client";

/**
 * useBetting Hook - Migrated for Anza Kit compatibility
 *
 * This hook provides betting state management and operations.
 * Uses wallet adapter for signing and legacy web3.js Transaction types.
 * Kit types are available via re-exports for gradual migration.
 */

import { useCallback, useState, useMemo } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction, TransactionInstruction } from "@solana/web3.js";
import { ONE_RNG, type Address, toKitAddress } from "@/lib/solana";
import { toast } from "sonner";
import { useCraps, CrapsState } from "../useCraps";
import { useTransaction } from "../useTransaction";
import {
  CrapsBetType,
  createPlaceCrapsBetInstruction,
  createClaimCrapsWinningsInstruction,
  createSettleCrapsInstruction,
  CrapsGame,
  CrapsPosition,
} from "@/lib/program";
import { useBoard } from "../useBoard";

/**
 * Represents a pending bet to be placed
 */
export interface PendingBet {
  betType: CrapsBetType;
  point: number;
  amount: number; // in RNG
}

/**
 * Options for placing a bet
 */
export interface PlaceBetOptions {
  betType: CrapsBetType;
  point?: number;
  amount: number; // in RNG
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
  const { publicKey, connected, signTransaction } = useWallet();
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
  const { board, round, refetch: refetchBoard } = useBoard();

  // Local state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isSettling, setIsSettling] = useState(false);

  // Computed convenience values
  const isConnected = useMemo(() => connected && publicKey !== null, [connected, publicKey]);

  // Get wallet address as Kit Address type for compatibility
  const walletAddress: Address | null = useMemo(
    () => publicKey ? toKitAddress(publicKey) : null,
    [publicKey]
  );

  const hasPosition = useMemo(() => position !== null, [position]);

  const hasPendingWinnings = useMemo(() => pendingWinnings > 0n, [pendingWinnings]);

  // Check if settlement is available (round has a winning square)
  const canSettleBets = useMemo(() => {
    return isConnected && round?.winningSquare !== null && board?.roundId !== undefined;
  }, [isConnected, round, board]);

  const houseBankrollRNG = useMemo(() => {
    return game ? Number(game.houseBankroll) / Number(ONE_RNG) : 0;
  }, [game]);

  const pendingWinningsRNG = useMemo(() => {
    return Number(pendingWinnings) / Number(ONE_RNG);
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

        const amountBaseUnits = BigInt(Math.floor(options.amount * Number(ONE_RNG)));
        const ix = createPlaceCrapsBetInstruction(
          publicKey,
          options.betType,
          options.point ?? 0,
          amountBaseUnits
        );

        const transaction = new Transaction().add(ix);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = publicKey;

        toast.info("Please confirm in your wallet...");

        // Use signTransaction + sendRawTransaction to avoid cross-origin iframe issues
        if (!signTransaction) {
          throw new Error("Wallet does not support signTransaction");
        }

        const signedTx = await signTransaction(transaction);
        const signature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

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
    [publicKey, isConnected, canPlaceBet, connection, signTransaction, refetchCraps]
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
          const amountBaseUnits = BigInt(Math.floor(bet.amount * Number(ONE_RNG)));
          const ix = createPlaceCrapsBetInstruction(
            publicKey,
            bet.betType,
            bet.point,
            amountBaseUnits
          );
          transaction.add(ix);
        }

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = publicKey;

        toast.info("Please confirm in your wallet...");

        // Use signTransaction + sendRawTransaction to avoid cross-origin iframe issues
        if (!signTransaction) {
          throw new Error("Wallet does not support signTransaction");
        }

        const signedTx = await signTransaction(transaction);
        const signature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

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
    [publicKey, isConnected, connection, signTransaction, refetchCraps]
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

      // Use signTransaction + sendRawTransaction to avoid cross-origin iframe issues
      if (!signTransaction) {
        throw new Error("Wallet does not support signTransaction");
      }

      const signedTx = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

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

      const winAmount = Number(pendingWinnings) / Number(ONE_RNG);
      toast.success(`Claimed ${winAmount.toFixed(4)} RNG!`);
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
  }, [publicKey, isConnected, pendingWinnings, connection, signTransaction, refetchCraps]);

  /**
   * Settle bets for the current round
   * Uses wallet signature to allow players to settle their own bets
   * @param customWinningSquare - Optional winning square for devnet (where slot_hash may be zero)
   * @returns Transaction signature or null if failed
   */
  const settleBets = useCallback(async (customWinningSquare?: number): Promise<string | null> => {
    if (!publicKey || !isConnected) {
      toast.error("Please connect your wallet first");
      return null;
    }

    // Allow custom winning square for devnet testing
    const effectiveWinningSquare = customWinningSquare ?? round?.winningSquare;

    if (effectiveWinningSquare === null || effectiveWinningSquare === undefined) {
      toast.error("Round not ready for settlement. Try rolling first.");
      return null;
    }

    if (!board || board.roundId === undefined) {
      toast.error("Board state not available");
      return null;
    }

    try {
      setIsSettling(true);
      toast.info("Preparing settlement...");

      const winningSquare = BigInt(effectiveWinningSquare);
      const roundId = board.roundId;

      const ix = createSettleCrapsInstruction(publicKey, winningSquare, roundId);
      const transaction = new Transaction().add(ix);

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      toast.info("Please confirm in your wallet...");

      if (!signTransaction) {
        throw new Error("Wallet does not support signTransaction");
      }

      const signedTx = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      if (!signature || typeof signature !== "string" || signature.length === 0) {
        throw new Error("Invalid transaction signature received");
      }

      toast.info("Confirming transaction...");
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });

      toast.success("Bets settled successfully!");
      refetchCraps();
      refetchBoard();
      return signature;
    } catch (error) {
      console.error("Settle bets error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      if (errorMessage.includes("User rejected")) {
        toast.error("Transaction cancelled");
      } else {
        toast.error(`Failed to settle bets: ${errorMessage}`);
      }
      return null;
    } finally {
      setIsSettling(false);
    }
  }, [publicKey, isConnected, round, board, connection, signTransaction, refetchCraps, refetchBoard]);

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

        // Use signTransaction + sendRawTransaction to avoid cross-origin iframe issues
        if (!signTransaction) {
          throw new Error("Wallet does not support signTransaction");
        }

        const signedTx = await signTransaction(tx);
        const signature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

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
    [connection, publicKey, signTransaction, isConnected, refetchCraps]
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
    // Board and round state for settlement
    board,
    round,

    // Computed convenience values
    isConnected,
    hasPosition,
    hasPendingWinnings,
    canSettleBets,
    houseBankrollRNG,
    pendingWinningsRNG,
    isSubmitting: isSubmitting || txLoading,
    isClaiming,
    isSettling,
    // Kit-compatible wallet address
    walletAddress,

    // Utility methods
    canPlaceBet,
    placeBet,
    placeBets,
    claimWinnings,
    settleBets,
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

// Re-export Kit types
export { type Address } from "@/lib/solana";
