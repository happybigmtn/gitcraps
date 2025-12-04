"use client";

/**
 * useUTH Hook - Ultimate Texas Hold'em game state management
 *
 * Fetches game and position state from on-chain accounts.
 */

import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  uthGamePDA,
  uthPositionPDA,
  parseUTHGame,
  parseUTHPosition,
  UTHGame,
  UTHPosition,
} from "@/lib/program";
import { withFallback, getCurrentEndpoint } from "@/lib/network";
import { useNetworkStore } from "@/store/networkStore";
import { useUTHStore } from "@/store/uthStore";
import { createDebugger } from "@/lib/debug";

const debug = createDebugger("useUTH");

// Rate limiting constants
const DEVNET_POLL_INTERVAL = 10000;
const LOCALNET_POLL_INTERVAL = 2000;
const BACKOFF_MULTIPLIER = 2;
const MAX_BACKOFF = 60000;
const INITIAL_BACKOFF = 5000;

export function useUTH() {
  const { publicKey } = useWallet();

  // Use store as single source of truth
  const {
    uthGame,
    uthPosition,
    isLoading,
    setUTHGame,
    setUTHPosition,
    setIsLoading
  } = useUTHStore();

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

  const fetchUTH = useCallback(
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

        const [uthGameAddress] = uthGamePDA();

        // Fetch game and position in parallel
        const { gameAccount, positionAccount } = await withFallback(
          async (conn) => {
            const fetchPromises: Promise<Awaited<ReturnType<typeof conn.getAccountInfo>>>[] = [
              conn.getAccountInfo(uthGameAddress),
            ];

            if (publicKey) {
              const [uthPositionAddress] = uthPositionPDA(publicKey);
              fetchPromises.push(conn.getAccountInfo(uthPositionAddress));
            }

            const results = await Promise.all(fetchPromises);

            return {
              gameAccount: results[0],
              positionAccount: publicKey ? results[1] : null,
            };
          }
        );

        if (gameAccount) {
          const parsedGame = parseUTHGame(Buffer.from(gameAccount.data));
          setUTHGame(parsedGame);
        } else {
          setUTHGame(null);
        }

        if (positionAccount) {
          const parsedPosition = parseUTHPosition(Buffer.from(positionAccount.data));
          setUTHPosition(parsedPosition);
        } else {
          setUTHPosition(null);
        }

        backoffRef.current = POLL_INTERVAL;
      } catch (err) {
        // Ignore aborted requests silently
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }

        console.error("Error fetching UTH:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Failed to fetch UTH data";

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
    [publicKey, POLL_INTERVAL, setUTHGame, setUTHPosition, setIsLoading]
  );

  useEffect(() => {
    debug(`Starting polling for network: ${network}`);

    let isMounted = true;

    backoffRef.current = POLL_INTERVAL;
    initialFetchDoneRef.current = false;

    fetchUTH(true);

    let timeoutId: NodeJS.Timeout;

    const schedulePoll = () => {
      if (!isMounted) return;

      timeoutId = setTimeout(() => {
        if (isMounted) {
          fetchUTH().then(() => {
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
  }, [network, POLL_INTERVAL, fetchUTH]);

  // Refetch when wallet changes
  useEffect(() => {
    fetchUTH(true);
  }, [publicKey, fetchUTH]);

  // Computed values
  const epochId = uthGame?.epochId ?? 0n;
  const houseBankroll = uthGame?.houseBankroll ?? 0n;
  const pendingWinnings = uthPosition?.pendingWinnings ?? 0n;
  const phase = uthPosition?.phase ?? 0;

  const refetch = useCallback(() => fetchUTH(true), [fetchUTH]);

  return useMemo(
    () => ({
      game: uthGame,
      position: uthPosition,
      loading: isLoading,
      error,
      refetch,
      epochId,
      houseBankroll,
      pendingWinnings,
      phase,
      canPlaceAnte: !!uthGame && houseBankroll > 0n,
    }),
    [
      uthGame,
      uthPosition,
      isLoading,
      error,
      refetch,
      epochId,
      houseBankroll,
      pendingWinnings,
      phase,
    ]
  );
}

// Re-export types
export type { UTHGame, UTHPosition } from "@/lib/program";
