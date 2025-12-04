"use client";

/**
 * useRoulette Hook - Roulette game state management
 *
 * This hook provides roulette game state management.
 * Uses wallet adapter for wallet state and legacy web3.js for account fetching.
 */

import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  rouletteGamePDA,
  roulettePositionPDA,
  parseRouletteGame,
  parseRoulettePosition,
  RouletteGame,
  RoulettePosition,
} from "@/lib/program";
import { withFallback, getCurrentEndpoint } from "@/lib/network";
import { useNetworkStore } from "@/store/networkStore";
import { useRouletteStore } from "@/store/rouletteStore";
import { createDebugger } from "@/lib/debug";

const debug = createDebugger("useRoulette");

// Rate limiting constants
const DEVNET_POLL_INTERVAL = 10000;
const LOCALNET_POLL_INTERVAL = 2000;
const BACKOFF_MULTIPLIER = 2;
const MAX_BACKOFF = 60000;
const INITIAL_BACKOFF = 5000;

export interface RouletteState {
  game: RouletteGame | null;
  position: RoulettePosition | null;
  loading: boolean;
  error: string | null;
}

export function useRoulette() {
  const { publicKey } = useWallet();

  // Use store as single source of truth
  const {
    rouletteGame,
    roulettePosition,
    isLoading,
    setRouletteGame,
    setRoulettePosition,
    setIsLoading
  } = useRouletteStore();

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

  const fetchRoulette = useCallback(
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

        const [rouletteGameAddress] = rouletteGamePDA();

        // Fetch roulette game and position in parallel
        const { gameAccount, positionAccount } = await withFallback(
          async (conn) => {
            const fetchPromises: Promise<Awaited<ReturnType<typeof conn.getAccountInfo>>>[] = [
              conn.getAccountInfo(rouletteGameAddress),
            ];

            if (publicKey) {
              const [roulettePositionAddress] = roulettePositionPDA(publicKey);
              fetchPromises.push(conn.getAccountInfo(roulettePositionAddress));
            }

            const results = await Promise.all(fetchPromises);

            return {
              gameAccount: results[0],
              positionAccount: publicKey ? results[1] : null,
            };
          }
        );

        if (gameAccount) {
          const parsedGame = parseRouletteGame(Buffer.from(gameAccount.data));
          setRouletteGame(parsedGame);
        } else {
          setRouletteGame(null);
        }

        if (positionAccount) {
          const parsedPosition = parseRoulettePosition(
            Buffer.from(positionAccount.data)
          );
          setRoulettePosition(parsedPosition);
        } else {
          setRoulettePosition(null);
        }

        backoffRef.current = POLL_INTERVAL;
      } catch (err) {
        // Ignore aborted requests silently
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }

        console.error("Error fetching roulette:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Failed to fetch roulette data";

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
    [publicKey, POLL_INTERVAL, setRouletteGame, setRoulettePosition, setIsLoading]
  );

  useEffect(() => {
    debug(`Starting polling for network: ${network}`);

    let isMounted = true;
    let isPaused = false;

    backoffRef.current = POLL_INTERVAL;
    initialFetchDoneRef.current = false;

    fetchRoulette(true);

    let timeoutId: NodeJS.Timeout;

    const schedulePoll = () => {
      if (!isMounted) return;

      timeoutId = setTimeout(() => {
        if (isMounted && !isPaused) {
          fetchRoulette().then(() => {
            schedulePoll();
          });
        } else if (isMounted) {
          // Still schedule next check even when paused
          schedulePoll();
        }
      }, POLL_INTERVAL);
    };

    // Pause polling when tab is hidden to reduce RPC calls
    const handleVisibilityChange = () => {
      if (document.hidden) {
        debug("Tab hidden - pausing polling");
        isPaused = true;
      } else {
        debug("Tab visible - resuming polling");
        isPaused = false;
        // Fetch immediately when tab becomes visible
        fetchRoulette(true);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    schedulePoll();

    return () => {
      debug(`Stopping polling for network: ${network}`);
      isMounted = false;
      clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [network, POLL_INTERVAL, fetchRoulette]);

  // Refetch when wallet changes
  useEffect(() => {
    fetchRoulette(true);
  }, [publicKey, fetchRoulette]);

  // Computed values from on-chain state
  const epochId = rouletteGame?.epochId ?? 0n;
  const houseBankroll = rouletteGame?.houseBankroll ?? 0n;
  const wheelType = rouletteGame?.wheelType ?? 0;
  const lastResult = rouletteGame?.lastResult ?? 255;
  const pendingWinnings = roulettePosition?.pendingWinnings ?? 0n;
  const canPlaceBets = rouletteGame !== null;

  // Memoize refetch
  const refetch = useCallback(() => fetchRoulette(true), [fetchRoulette]);

  return useMemo(
    () => ({
      // Return data from store
      game: rouletteGame,
      position: roulettePosition,
      loading: isLoading,
      error,
      refetch,
      // Computed values
      epochId,
      houseBankroll,
      wheelType,
      lastResult,
      pendingWinnings,
      canPlaceBets,
    }),
    [
      rouletteGame,
      roulettePosition,
      isLoading,
      error,
      refetch,
      epochId,
      houseBankroll,
      wheelType,
      lastResult,
      pendingWinnings,
      canPlaceBets,
    ]
  );
}
