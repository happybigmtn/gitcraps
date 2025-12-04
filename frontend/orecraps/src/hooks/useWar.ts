"use client";

/**
 * useWar Hook - Casino War game state management
 *
 * Fetches game and position state from on-chain accounts.
 */

import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  warGamePDA,
  warPositionPDA,
  parseWarGame,
  parseWarPosition,
  WarGame,
  WarPosition,
} from "@/lib/program";
import { withFallback, getCurrentEndpoint } from "@/lib/network";
import { useNetworkStore } from "@/store/networkStore";
import { useWarStore } from "@/store/warStore";
import { createDebugger } from "@/lib/debug";

const debug = createDebugger("useWar");

// Rate limiting constants
const DEVNET_POLL_INTERVAL = 10000;
const LOCALNET_POLL_INTERVAL = 2000;
const BACKOFF_MULTIPLIER = 2;
const MAX_BACKOFF = 60000;
const INITIAL_BACKOFF = 5000;

export function useWar() {
  const { publicKey } = useWallet();

  // Use store as single source of truth
  const {
    warGame,
    warPosition,
    isLoading,
    setWarGame,
    setWarPosition,
    setIsLoading
  } = useWarStore();

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

  const fetchWar = useCallback(
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

        const [warGameAddress] = warGamePDA();

        // Fetch war game and position in parallel
        const { gameAccount, positionAccount } = await withFallback(
          async (conn) => {
            const fetchPromises: Promise<Awaited<ReturnType<typeof conn.getAccountInfo>>>[] = [
              conn.getAccountInfo(warGameAddress),
            ];

            if (publicKey) {
              const [warPositionAddress] = warPositionPDA(publicKey);
              fetchPromises.push(conn.getAccountInfo(warPositionAddress));
            }

            const results = await Promise.all(fetchPromises);

            return {
              gameAccount: results[0],
              positionAccount: publicKey ? results[1] : null,
            };
          }
        );

        if (gameAccount) {
          const parsedGame = parseWarGame(Buffer.from(gameAccount.data));
          setWarGame(parsedGame);
        } else {
          setWarGame(null);
        }

        if (positionAccount) {
          const parsedPosition = parseWarPosition(Buffer.from(positionAccount.data));
          setWarPosition(parsedPosition);
        } else {
          setWarPosition(null);
        }

        backoffRef.current = POLL_INTERVAL;
      } catch (err) {
        // Ignore aborted requests silently
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }

        console.error("Error fetching war:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Failed to fetch war data";

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
    [publicKey, POLL_INTERVAL, setWarGame, setWarPosition, setIsLoading]
  );

  useEffect(() => {
    debug(`Starting polling for network: ${network}`);

    let isMounted = true;

    backoffRef.current = POLL_INTERVAL;
    initialFetchDoneRef.current = false;

    fetchWar(true);

    let timeoutId: NodeJS.Timeout;

    const schedulePoll = () => {
      if (!isMounted) return;

      timeoutId = setTimeout(() => {
        if (isMounted) {
          fetchWar().then(() => {
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
  }, [network, POLL_INTERVAL, fetchWar]);

  // Refetch when wallet changes
  useEffect(() => {
    fetchWar(true);
  }, [publicKey, fetchWar]);

  // Computed values
  const epochId = warGame?.epochId ?? 0n;
  const houseBankroll = warGame?.houseBankroll ?? 0n;
  const pendingWinnings = warPosition?.pendingWinnings ?? 0n;
  const gameState = warPosition?.state ?? 0;

  const refetch = useCallback(() => fetchWar(true), [fetchWar]);

  return useMemo(
    () => ({
      game: warGame,
      position: warPosition,
      loading: isLoading,
      error,
      refetch,
      epochId,
      houseBankroll,
      pendingWinnings,
      gameState,
      canPlaceBets: !!warGame && houseBankroll > 0n,
    }),
    [
      warGame,
      warPosition,
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
export type { WarGame, WarPosition } from "@/lib/program";
