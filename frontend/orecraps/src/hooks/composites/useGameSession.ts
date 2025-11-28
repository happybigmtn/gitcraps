"use client";

import { useMemo } from "react";
import { useBoard, BoardState, RoundState } from "../useBoard";
import { useNetworkStore, NetworkType } from "@/store/networkStore";

/**
 * Composite hook that combines board, round, and network state
 *
 * This hook reduces coupling by providing a single interface for game session
 * state management. Components can use this instead of importing multiple hooks.
 *
 * @returns Combined game session state and utilities
 *
 * @example
 * ```tsx
 * function GameComponent() {
 *   const { board, round, network, isActive, timeRemaining } = useGameSession();
 *
 *   if (!isActive) {
 *     return <div>Waiting for round...</div>;
 *   }
 *
 *   return <div>Round {round.id.toString()} - {timeRemaining}s remaining</div>;
 * }
 * ```
 */
export function useGameSession() {
  // Individual hooks (re-exported for backward compatibility)
  const { board, round, loading, error, refetch, getTimeRemaining } = useBoard();
  const { network, setNetwork, getCurrentProgramId } = useNetworkStore();

  // Computed convenience values
  const isActive = useMemo(() => {
    return board !== null && round !== null;
  }, [board, round]);

  const timeRemaining = useMemo(() => {
    return getTimeRemaining();
  }, [getTimeRemaining]);

  const currentRoundId = useMemo(() => {
    return board?.roundId ?? null;
  }, [board]);

  const slotsRemaining = useMemo(() => {
    if (!board || !round) return null;
    return Number(round.expiresAt - board.currentSlot);
  }, [board, round]);

  const isRoundExpired = useMemo(() => {
    if (!board || !round) return false;
    return board.currentSlot >= round.expiresAt;
  }, [board, round]);

  const hasWinningSquare = useMemo(() => {
    return round?.winningSquare !== null && round?.winningSquare !== undefined;
  }, [round]);

  /**
   * Get deployed amount for a specific square
   * @param squareIndex - Index of the square (0-35)
   * @returns Deployed amount in lamports, or 0n if not available
   */
  const getSquareDeployed = (squareIndex: number): bigint => {
    if (!round || squareIndex < 0 || squareIndex >= 36) return 0n;
    return round.deployed[squareIndex] ?? 0n;
  };

  /**
   * Get miner count for a specific square
   * @param squareIndex - Index of the square (0-35)
   * @returns Number of miners, or 0n if not available
   */
  const getSquareCount = (squareIndex: number): bigint => {
    if (!round || squareIndex < 0 || squareIndex >= 36) return 0n;
    return round.count[squareIndex] ?? 0n;
  };

  /**
   * Check if the session is in a loading state
   */
  const isLoading = loading;

  /**
   * Check if there's an error in the session
   */
  const hasError = error !== null;

  return {
    // Raw state (for backward compatibility)
    board,
    round,
    loading,
    error,
    network,

    // Computed convenience values
    isActive,
    timeRemaining,
    currentRoundId,
    slotsRemaining,
    isRoundExpired,
    hasWinningSquare,
    isLoading,
    hasError,

    // Utility methods
    refetch,
    getTimeRemaining,
    setNetwork,
    getCurrentProgramId,
    getSquareDeployed,
    getSquareCount,
  };
}

/**
 * Type export for components that want to type their props
 */
export type GameSession = ReturnType<typeof useGameSession>;

// Re-export types for convenience
export type { BoardState, RoundState, NetworkType };
