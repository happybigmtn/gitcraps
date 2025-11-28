"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  crapsGamePDA,
  crapsPositionPDA,
  parseCrapsGame,
  parseCrapsPosition,
  CrapsGame,
  CrapsPosition,
} from "@/lib/program";
import { withFallback, getCurrentEndpoint } from "@/lib/rpcManager";
import { useNetworkStore } from "@/store/networkStore";
import { createDebugger } from "@/lib/debug";

const debug = createDebugger("useCraps");

// Rate limiting constants
const DEVNET_POLL_INTERVAL = 10000;
const LOCALNET_POLL_INTERVAL = 2000;
const BACKOFF_MULTIPLIER = 2;
const MAX_BACKOFF = 60000;
const INITIAL_BACKOFF = 5000;

export interface CrapsState {
  game: CrapsGame | null;
  position: CrapsPosition | null;
  loading: boolean;
  error: string | null;
}

export function useCraps() {
  const { publicKey } = useWallet();
  const [game, setGame] = useState<CrapsGame | null>(null);
  const [position, setPosition] = useState<CrapsPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { network } = useNetworkStore();
  const isLocalnet = network === "localnet";

  const POLL_INTERVAL = isLocalnet ? LOCALNET_POLL_INTERVAL : DEVNET_POLL_INTERVAL;

  const lastFetchRef = useRef<number>(0);
  const backoffRef = useRef<number>(POLL_INTERVAL);
  const fetchingRef = useRef<boolean>(false);
  const initialFetchDoneRef = useRef<boolean>(false);
  // FIXED: AbortController for cancelling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchCraps = useCallback(
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
          setLoading(true);
        }
        setError(null);

        const [crapsGameAddress] = crapsGamePDA();

        // Fetch craps game and position in parallel for scalability
        const { gameAccount, positionAccount } = await withFallback(
          async (conn) => {
            // Build list of accounts to fetch in parallel
            const fetchPromises: Promise<Awaited<ReturnType<typeof conn.getAccountInfo>>>[] = [
              conn.getAccountInfo(crapsGameAddress),
            ];

            // Add position fetch if wallet is connected
            if (publicKey) {
              const [crapsPositionAddress] = crapsPositionPDA(publicKey);
              fetchPromises.push(conn.getAccountInfo(crapsPositionAddress));
            }

            // Parallel fetch for better performance at scale
            const results = await Promise.all(fetchPromises);

            return {
              gameAccount: results[0],
              positionAccount: publicKey ? results[1] : null,
            };
          }
        );

        if (gameAccount) {
          const parsedGame = parseCrapsGame(Buffer.from(gameAccount.data));
          setGame(parsedGame);
        } else {
          setGame(null);
        }

        if (positionAccount) {
          const parsedPosition = parseCrapsPosition(
            Buffer.from(positionAccount.data)
          );
          setPosition(parsedPosition);
        } else {
          setPosition(null);
        }

        backoffRef.current = POLL_INTERVAL;
      } catch (err) {
        // FIXED: Ignore aborted requests silently
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }

        console.error("Error fetching craps:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Failed to fetch craps data";

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
        setLoading(false);
        fetchingRef.current = false;
        initialFetchDoneRef.current = true;
      }
    },
    [publicKey, POLL_INTERVAL]
  );

  useEffect(() => {
    debug(`Starting polling for network: ${network}`);

    // FIXED: Track mounted state to prevent updates after unmount
    let isMounted = true;

    backoffRef.current = POLL_INTERVAL;
    initialFetchDoneRef.current = false;

    fetchCraps(true);

    // Use adaptive setTimeout pattern instead of setInterval
    let timeoutId: NodeJS.Timeout;

    const schedulePoll = () => {
      // Don't schedule if unmounted
      if (!isMounted) return;

      timeoutId = setTimeout(() => {
        if (isMounted) {
          fetchCraps().then(() => {
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
      // FIXED: Cancel any in-flight requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [network, POLL_INTERVAL, fetchCraps]);

  // Refetch when wallet changes
  useEffect(() => {
    fetchCraps(true);
  }, [publicKey, fetchCraps]);

  // Computed values (all from on-chain state only)
  const isComeOut = game?.isComeOut ?? true;
  const currentPoint = game?.point ?? 0;
  const epochId = game?.epochId ?? 0n;
  const houseBankroll = game?.houseBankroll ?? 0n;
  const pendingWinnings = position?.pendingWinnings ?? 0n;

  return {
    game,
    position,
    loading,
    error,
    refetch: () => fetchCraps(true),
    // Computed values (on-chain only)
    isComeOut,
    currentPoint,
    epochId,
    houseBankroll,
    pendingWinnings,
  };
}
