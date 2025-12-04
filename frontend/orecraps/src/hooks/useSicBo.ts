"use client";

/**
 * useSicBo Hook - Sic Bo game state management
 *
 * Fetches game and position state from on-chain accounts.
 */

import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  sicboGamePDA,
  sicboPositionPDA,
  parseSicBoGame,
  parseSicBoPosition,
  SicBoGame,
  SicBoPosition,
} from "@/lib/program";
import { withFallback, getCurrentEndpoint } from "@/lib/network";
import { useNetworkStore } from "@/store/networkStore";
import { useSicBoStore } from "@/store/sicboStore";
import { createDebugger } from "@/lib/debug";

const debug = createDebugger("useSicBo");

// Rate limiting constants
const DEVNET_POLL_INTERVAL = 10000;
const LOCALNET_POLL_INTERVAL = 2000;
const BACKOFF_MULTIPLIER = 2;
const MAX_BACKOFF = 60000;
const INITIAL_BACKOFF = 5000;

export function useSicBo() {
  const { publicKey } = useWallet();

  // Use store as single source of truth
  const {
    sicboGame,
    sicboPosition,
    isLoading,
    setSicBoGame,
    setSicBoPosition,
    setIsLoading
  } = useSicBoStore();

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

  const fetchSicBo = useCallback(
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

        const [sicboGameAddress] = sicboGamePDA();

        // Fetch sic bo game and position in parallel
        const { gameAccount, positionAccount } = await withFallback(
          async (conn) => {
            const fetchPromises: Promise<Awaited<ReturnType<typeof conn.getAccountInfo>>>[] = [
              conn.getAccountInfo(sicboGameAddress),
            ];

            if (publicKey) {
              const [sicboPositionAddress] = sicboPositionPDA(publicKey);
              fetchPromises.push(conn.getAccountInfo(sicboPositionAddress));
            }

            const results = await Promise.all(fetchPromises);

            return {
              gameAccount: results[0],
              positionAccount: publicKey ? results[1] : null,
            };
          }
        );

        if (gameAccount) {
          const parsedGame = parseSicBoGame(Buffer.from(gameAccount.data));
          setSicBoGame(parsedGame);
        } else {
          setSicBoGame(null);
        }

        if (positionAccount) {
          const parsedPosition = parseSicBoPosition(Buffer.from(positionAccount.data));
          setSicBoPosition(parsedPosition);
        } else {
          setSicBoPosition(null);
        }

        backoffRef.current = POLL_INTERVAL;
      } catch (err) {
        // Ignore aborted requests silently
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }

        console.error("Error fetching sic bo:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Failed to fetch sic bo data";

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
    [publicKey, POLL_INTERVAL, setSicBoGame, setSicBoPosition, setIsLoading]
  );

  useEffect(() => {
    debug(`Starting polling for network: ${network}`);

    let isMounted = true;

    backoffRef.current = POLL_INTERVAL;
    initialFetchDoneRef.current = false;

    fetchSicBo(true);

    let timeoutId: NodeJS.Timeout;

    const schedulePoll = () => {
      if (!isMounted) return;

      timeoutId = setTimeout(() => {
        if (isMounted) {
          fetchSicBo().then(() => {
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
  }, [network, POLL_INTERVAL, fetchSicBo]);

  // Refetch when wallet changes
  useEffect(() => {
    fetchSicBo(true);
  }, [publicKey, fetchSicBo]);

  // Computed values
  const epochId = sicboGame?.epochId ?? 0n;
  const houseBankroll = sicboGame?.houseBankroll ?? 0n;
  const lastDice = sicboGame?.lastDice ?? [0, 0, 0];
  const pendingWinnings = sicboPosition?.pendingWinnings ?? 0n;

  const refetch = useCallback(() => fetchSicBo(true), [fetchSicBo]);

  return useMemo(
    () => ({
      game: sicboGame,
      position: sicboPosition,
      loading: isLoading,
      error,
      refetch,
      epochId,
      houseBankroll,
      lastDice,
      pendingWinnings,
      canPlaceBets: !!sicboGame && houseBankroll > 0n,
    }),
    [
      sicboGame,
      sicboPosition,
      isLoading,
      error,
      refetch,
      epochId,
      houseBankroll,
      lastDice,
      pendingWinnings,
    ]
  );
}

// Re-export types
export type { SicBoGame, SicBoPosition } from "@/lib/program";
