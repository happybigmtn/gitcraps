"use client";

/**
 * useDelegatedBetting Hook - Session-aware betting with gasless transaction support
 *
 * This hook wraps useBetting and routes transactions through the delegated API
 * when a valid session is active, enabling gas-free transactions for web wallet users.
 */

import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useBetting, type PendingBet, type PlaceBetOptions } from "./useBetting";
import { useSession } from "../useSession";
import { useSessionStore, type SessionData } from "@/store/sessionStore";
import { CrapsBetType } from "@/lib/program";

/**
 * Session credentials sent to the delegated API
 */
interface SessionCredentials {
  walletAddress: string;
  sessionPublicKey: string;
  approvalSignature: string;
  approvalMessage: string;
  expiresAt: number;
}

/**
 * Convert SessionData to API credentials format
 */
function toSessionCredentials(session: SessionData): SessionCredentials {
  return {
    walletAddress: session.walletAddress,
    sessionPublicKey: session.sessionPublicKey,
    approvalSignature: session.approvalSignature,
    approvalMessage: session.approvalMessage,
    expiresAt: session.expiresAt,
  };
}

/**
 * useDelegatedBetting Hook
 *
 * Provides the same interface as useBetting but automatically routes transactions
 * through the delegated API when a valid session is active. This enables:
 *
 * 1. Gas-free transactions for web wallet users
 * 2. Seamless fallback to standard wallet signing when no session
 * 3. Same API surface for components - no code changes needed
 *
 * @returns Combined betting state and session-aware operations
 *
 * @example
 * ```tsx
 * function BettingComponent() {
 *   const {
 *     session,
 *     isSessionActive,
 *     createSession,
 *     placeBet,
 *     claimWinnings,
 *   } = useDelegatedBetting();
 *
 *   // If no session, prompt user to create one
 *   if (!isSessionActive) {
 *     return <button onClick={createSession}>Enable Gas-Free Mode</button>;
 *   }
 *
 *   // Use placeBet as normal - it routes through delegated API automatically
 *   const handleBet = () => placeBet({ betType: CrapsBetType.PassLine, amount: 1 });
 * }
 * ```
 */
export function useDelegatedBetting() {
  // Get standard betting functionality
  const betting = useBetting();

  // Get session state
  const {
    session,
    isValid: isSessionActive,
    isCreating: isSessionCreating,
    remainingTime,
    remainingTimeFormatted,
    createSession,
    endSession,
    error: sessionError,
  } = useSession();

  const { setIsDelegating } = useSessionStore();

  // Check if we should use delegated transactions
  const useDelegated = useMemo(() => {
    return isSessionActive && session !== null;
  }, [isSessionActive, session]);

  /**
   * Place a single bet - routes through delegated API if session is active
   */
  const placeBet = useCallback(
    async (options: PlaceBetOptions): Promise<string | null> => {
      // If no active session, use standard wallet signing
      if (!useDelegated || !session) {
        return betting.placeBet(options);
      }

      // Validate bet can be placed
      if (!betting.canPlaceBet(options.betType)) {
        toast.error("This bet type cannot be placed at this time");
        return null;
      }

      try {
        setIsDelegating(true);
        toast.info("Submitting bet...");

        const response = await fetch("/api/delegated", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session: toSessionCredentials(session),
            action: "place-bet",
            bets: [
              {
                betType: options.betType,
                point: options.point ?? 0,
                amount: options.amount,
              },
            ],
          }),
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "Transaction failed");
        }

        toast.success("Bet placed successfully! (Gas-free)");
        betting.refetch();
        return result.signature;
      } catch (error) {
        console.error("Delegated bet error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        toast.error(`Failed to place bet: ${message}`);
        return null;
      } finally {
        setIsDelegating(false);
      }
    },
    [useDelegated, session, betting, setIsDelegating]
  );

  /**
   * Place multiple bets - routes through delegated API if session is active
   */
  const placeBets = useCallback(
    async (bets: PendingBet[]): Promise<string | null> => {
      // If no active session, use standard wallet signing
      if (!useDelegated || !session) {
        return betting.placeBets(bets);
      }

      if (bets.length === 0) {
        toast.error("No bets to submit");
        return null;
      }

      try {
        setIsDelegating(true);
        toast.info("Submitting bets...");

        const response = await fetch("/api/delegated", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session: toSessionCredentials(session),
            action: "place-bet",
            bets: bets.map((bet) => ({
              betType: bet.betType,
              point: bet.point,
              amount: bet.amount,
            })),
          }),
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "Transaction failed");
        }

        toast.success(`Placed ${bets.length} bet(s) successfully! (Gas-free)`);
        betting.refetch();
        return result.signature;
      } catch (error) {
        console.error("Delegated bets error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        toast.error(`Failed to place bets: ${message}`);
        return null;
      } finally {
        setIsDelegating(false);
      }
    },
    [useDelegated, session, betting, setIsDelegating]
  );

  /**
   * Claim winnings - routes through delegated API if session is active
   */
  const claimWinnings = useCallback(async (): Promise<string | null> => {
    // If no active session, use standard wallet signing
    if (!useDelegated || !session) {
      return betting.claimWinnings();
    }

    if (!betting.hasPendingWinnings) {
      toast.error("No winnings to claim");
      return null;
    }

    try {
      setIsDelegating(true);
      toast.info("Claiming winnings...");

      const response = await fetch("/api/delegated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: toSessionCredentials(session),
          action: "claim-winnings",
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Claim failed");
      }

      toast.success(`Claimed ${betting.pendingWinningsRNG.toFixed(4)} RNG! (Gas-free)`);
      betting.refetch();
      return result.signature;
    } catch (error) {
      console.error("Delegated claim error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to claim: ${message}`);
      return null;
    } finally {
      setIsDelegating(false);
    }
  }, [useDelegated, session, betting, setIsDelegating]);

  /**
   * Settle bets - routes through delegated API if session is active
   */
  const settleBets = useCallback(async (): Promise<string | null> => {
    // If no active session, use standard wallet signing
    if (!useDelegated || !session) {
      return betting.settleBets();
    }

    if (!betting.canSettleBets) {
      toast.error("Round not ready for settlement");
      return null;
    }

    if (!betting.round || betting.round.winningSquare === null) {
      toast.error("Round not ready for settlement");
      return null;
    }

    if (!betting.board || betting.board.roundId === undefined) {
      toast.error("Board state not available");
      return null;
    }

    try {
      setIsDelegating(true);
      toast.info("Settling bets...");

      const response = await fetch("/api/delegated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: toSessionCredentials(session),
          action: "settle-bets",
          roundId: betting.board.roundId.toString(),
          winningSquare: betting.round.winningSquare.toString(),
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Settlement failed");
      }

      toast.success("Bets settled successfully! (Gas-free)");
      betting.refetch();
      return result.signature;
    } catch (error) {
      console.error("Delegated settle error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to settle: ${message}`);
      return null;
    } finally {
      setIsDelegating(false);
    }
  }, [useDelegated, session, betting, setIsDelegating]);

  return {
    // All standard betting functionality
    ...betting,

    // Override transaction methods with session-aware versions
    placeBet,
    placeBets,
    claimWinnings,
    settleBets,

    // Session state
    session,
    isSessionActive,
    isSessionCreating,
    sessionRemainingTime: remainingTime,
    sessionRemainingTimeFormatted: remainingTimeFormatted,
    sessionError,

    // Session actions
    createSession,
    endSession,

    // Whether delegated mode is being used
    useDelegated,
  };
}

/**
 * Type export for components that want to type their props
 */
export type DelegatedBettingSession = ReturnType<typeof useDelegatedBetting>;

// Re-export types for convenience
export type { PendingBet, PlaceBetOptions } from "./useBetting";
export { CrapsBetType } from "@/lib/program";
