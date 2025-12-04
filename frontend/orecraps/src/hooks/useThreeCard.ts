"use client";

/**
 * useThreeCard Hook - Three Card Poker game state management
 *
 * Fetches game and position state from on-chain accounts.
 */

import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  threeCardGamePDA,
  threeCardPositionPDA,
  parseThreeCardGame,
  parseThreeCardPosition,
  ThreeCardGame,
  ThreeCardPosition,
} from "@/lib/program";
import { withFallback, getCurrentEndpoint } from "@/lib/network";
import { useNetworkStore } from "@/store/networkStore";
import { useThreeCardStore } from "@/store/threeCardStore";
import { createDebugger } from "@/lib/debug";

const debug = createDebugger("useThreeCard");

// Rate limiting constants
const DEVNET_POLL_INTERVAL = 10000;
const LOCALNET_POLL_INTERVAL = 2000;
const BACKOFF_MULTIPLIER = 2;
const MAX_BACKOFF = 60000;
const INITIAL_BACKOFF = 5000;

export function useThreeCard() {
  const { publicKey } = useWallet();

  // Use store as single source of truth
  const {
    threeCardGame,
    threeCardPosition,
    isLoading,
    setThreeCardGame,
    setThreeCardPosition,
    setIsLoading
  } = useThreeCardStore();

  // Only keep error in local state as it's not in the store
  const [error, setError] = useState<string | null>(null);

  const { network } = useNetworkStore();
  const isLocalnet = network === "localnet";

  const POLL_INTERVAL = isLocalnet ? LOCALNET_POLL_INTERVAL : DEVNET_POLL_INTERVAL;

  const lastFetchRef = useRef<number>(0);
  const backoffRef = useRef<number>(POLL_INTERVAL);
  const fetchingRef = useRef<boolean>(false);
  const initialFetchDoneRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchThreeCard = useCallback(
    async (force = false) => {
      if (fetchingRef.current) return;

      const now = Date.now();
      const timeSinceLastFetch = now - lastFetchRef.current;
      if (!force && timeSinceLastFetch < backoffRef.current) return;

      // Cancel any previous in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      fetchingRef.current = true;
      lastFetchRef.current = now;

      try {
        if (!initialFetchDoneRef.current) {
          setIsLoading(true);
        }
        setError(null);

        const [threeCardGameAddress] = threeCardGamePDA();

        // Fetch game and position in parallel
        const { gameAccount, positionAccount } = await withFallback(
          async (conn) => {
            const fetchPromises: Promise<Awaited<ReturnType<typeof conn.getAccountInfo>>>[] = [
              conn.getAccountInfo(threeCardGameAddress),
            ];

            if (publicKey) {
              const [threeCardPositionAddress] = threeCardPositionPDA(publicKey);
              fetchPromises.push(conn.getAccountInfo(threeCardPositionAddress));
            }

            const results = await Promise.all(fetchPromises);

            return {
              gameAccount: results[0],
              positionAccount: publicKey ? results[1] : null,
            };
          }
        );

        if (gameAccount) {
          const parsedGame = parseThreeCardGame(Buffer.from(gameAccount.data));
          setThreeCardGame(parsedGame);
        } else {
          setThreeCardGame(null);
        }

        if (positionAccount) {
          const parsedPosition = parseThreeCardPosition(Buffer.from(positionAccount.data));
          setThreeCardPosition(parsedPosition);
        } else {
          setThreeCardPosition(null);
        }

        backoffRef.current = POLL_INTERVAL;
      } catch (err) {
        // Ignore aborted requests silently
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }

        console.error("Error fetching three card:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Failed to fetch three card data";

        if (
          errorMessage.includes("429") ||
          errorMessage.includes("rate limit")
        ) {
          const newBackoff = Math.max(
            INITIAL_BACKOFF,
            backoffRef.current * BACKOFF_MULTIPLIER
          );
          backoffRef.current = Math.min(newBackoff, MAX_BACKOFF);
          console.warn(
            `Rate limited - backing off to ${backoffRef.current}ms. Current RPC: ${getCurrentEndpoint()}`
          );
        } else {
          setError(errorMessage);
        }
      } finally {
        setIsLoading(false);
        fetchingRef.current = false;
        initialFetchDoneRef.current = true;
      }
    },
    [publicKey, POLL_INTERVAL, setThreeCardGame, setThreeCardPosition, setIsLoading]
  );

  useEffect(() => {
    debug(`Starting polling for network: ${network}`);

    let isMounted = true;

    backoffRef.current = POLL_INTERVAL;
    initialFetchDoneRef.current = false;

    fetchThreeCard(true);

    let timeoutId: NodeJS.Timeout;

    const schedulePoll = () => {
      if (!isMounted) return;

      timeoutId = setTimeout(() => {
        if (isMounted) {
          fetchThreeCard().then(() => {
            schedulePoll();
          });
        }
      }, POLL_INTERVAL);
    };

    schedulePoll();

    return () => {
      debug(`Stopping polling for network: ${network}`);
      isMounted = false;
      clearTimeout(timeoutId);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [network, POLL_INTERVAL, fetchThreeCard]);

  // Refetch when wallet changes
  useEffect(() => {
    fetchThreeCard(true);
  }, [publicKey, fetchThreeCard]);

  // Computed values
  const epochId = threeCardGame?.epochId ?? 0n;
  const houseBankroll = threeCardGame?.houseBankroll ?? 0n;
  const pendingWinnings = threeCardPosition?.pendingWinnings ?? 0n;
  const gameState = threeCardPosition?.state ?? 0;

  const refetch = useCallback(() => fetchThreeCard(true), [fetchThreeCard]);

  return useMemo(
    () => ({
      game: threeCardGame,
      position: threeCardPosition,
      loading: isLoading,
      error,
      refetch,
      epochId,
      houseBankroll,
      pendingWinnings,
      gameState,
      canPlaceBets: !!threeCardGame && houseBankroll > 0n,
    }),
    [
      threeCardGame,
      threeCardPosition,
      isLoading,
      error,
      refetch,
      epochId,
      houseBankroll,
      pendingWinnings,
      gameState,
    ]
  );
}

// Re-export types
export type { ThreeCardGame, ThreeCardPosition } from "@/lib/program";
