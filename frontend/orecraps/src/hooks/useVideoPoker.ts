"use client";

/**
 * useVideoPoker Hook - Video Poker game state management
 *
 * Fetches game and position state from on-chain accounts.
 */

import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  videoPokerGamePDA,
  videoPokerPositionPDA,
  parseVideoPokerGame,
  parseVideoPokerPosition,
  VideoPokerGame,
  VideoPokerPosition,
} from "@/lib/program";
import { withFallback, getCurrentEndpoint } from "@/lib/network";
import { useNetworkStore } from "@/store/networkStore";
import { useVideoPokerStore } from "@/store/videoPokerStore";
import { createDebugger } from "@/lib/debug";

const debug = createDebugger("useVideoPoker");

// Rate limiting constants
const DEVNET_POLL_INTERVAL = 10000;
const LOCALNET_POLL_INTERVAL = 2000;
const BACKOFF_MULTIPLIER = 2;
const MAX_BACKOFF = 60000;
const INITIAL_BACKOFF = 5000;

export function useVideoPoker() {
  const { publicKey } = useWallet();

  // Use store as single source of truth
  const {
    videoPokerGame,
    videoPokerPosition,
    isLoading,
    setVideoPokerGame,
    setVideoPokerPosition,
    setIsLoading
  } = useVideoPokerStore();

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

  const fetchVideoPoker = useCallback(
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

        const [videoPokerGameAddress] = videoPokerGamePDA();

        // Fetch game and position in parallel
        const { gameAccount, positionAccount } = await withFallback(
          async (conn) => {
            const fetchPromises: Promise<Awaited<ReturnType<typeof conn.getAccountInfo>>>[] = [
              conn.getAccountInfo(videoPokerGameAddress),
            ];

            if (publicKey) {
              const [videoPokerPositionAddress] = videoPokerPositionPDA(publicKey);
              fetchPromises.push(conn.getAccountInfo(videoPokerPositionAddress));
            }

            const results = await Promise.all(fetchPromises);

            return {
              gameAccount: results[0],
              positionAccount: publicKey ? results[1] : null,
            };
          }
        );

        if (gameAccount) {
          const parsedGame = parseVideoPokerGame(Buffer.from(gameAccount.data));
          setVideoPokerGame(parsedGame);
        } else {
          setVideoPokerGame(null);
        }

        if (positionAccount) {
          const parsedPosition = parseVideoPokerPosition(Buffer.from(positionAccount.data));
          setVideoPokerPosition(parsedPosition);
        } else {
          setVideoPokerPosition(null);
        }

        backoffRef.current = POLL_INTERVAL;
      } catch (err) {
        // Ignore aborted requests silently
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }

        console.error("Error fetching video poker:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Failed to fetch video poker data";

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
    [publicKey, POLL_INTERVAL, setVideoPokerGame, setVideoPokerPosition, setIsLoading]
  );

  useEffect(() => {
    debug(`Starting polling for network: ${network}`);

    let isMounted = true;

    backoffRef.current = POLL_INTERVAL;
    initialFetchDoneRef.current = false;

    fetchVideoPoker(true);

    let timeoutId: NodeJS.Timeout;

    const schedulePoll = () => {
      if (!isMounted) return;

      timeoutId = setTimeout(() => {
        if (isMounted) {
          fetchVideoPoker().then(() => {
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
  }, [network, POLL_INTERVAL, fetchVideoPoker]);

  // Refetch when wallet changes
  useEffect(() => {
    fetchVideoPoker(true);
  }, [publicKey, fetchVideoPoker]);

  // Computed values
  const epochId = videoPokerGame?.epochId ?? 0n;
  const houseBankroll = videoPokerGame?.houseBankroll ?? 0n;
  const pendingWinnings = videoPokerPosition?.pendingWinnings ?? 0n;
  const gameState = videoPokerPosition?.state ?? 0;

  const refetch = useCallback(() => fetchVideoPoker(true), [fetchVideoPoker]);

  return useMemo(
    () => ({
      game: videoPokerGame,
      position: videoPokerPosition,
      loading: isLoading,
      error,
      refetch,
      epochId,
      houseBankroll,
      pendingWinnings,
      gameState,
      canPlaceBets: !!videoPokerGame && houseBankroll > 0n,
    }),
    [
      videoPokerGame,
      videoPokerPosition,
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
export type { VideoPokerGame, VideoPokerPosition } from "@/lib/program";
