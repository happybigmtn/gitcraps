"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { PublicKey } from "@solana/web3.js";
import { boardPDA, roundPDA, ORE_PROGRAM_ID } from "@/lib/solana";
import { BOARD_SIZE } from "@/lib/program";
import { withFallback, getConnection, getCurrentEndpoint } from "@/lib/rpcManager";
import { useNetworkStore } from "@/store/networkStore";
import { createDebugger } from "@/lib/debug";

const debug = createDebugger("useBoard");

export interface BoardState {
  roundId: bigint;
  roundSlots: bigint;
  currentSlot: bigint;
}

export interface RoundState {
  id: bigint;
  deployed: bigint[];
  count: bigint[];
  totalDeployed: bigint;
  expiresAt: bigint;
  motherlode: bigint;
  topMiner: string | null;
  slotHash: Uint8Array | null;
  winningSquare: number | null; // Calculated from slot_hash when available
  totalWinnings: bigint;
}

// Rate limiting constants - VERY conservative for devnet to avoid 429s
const DEVNET_MIN_POLL_INTERVAL = 10000; // Minimum 10 seconds between polls on devnet
const DEVNET_NORMAL_POLL_INTERVAL = 15000; // Normal polling at 15 seconds on devnet
const DEVNET_FAST_POLL_INTERVAL = 10000; // Fast polling when close to round end on devnet
// Localnet can poll much faster since there's no rate limiting
const LOCALNET_MIN_POLL_INTERVAL = 500; // 500ms minimum for localnet
const LOCALNET_NORMAL_POLL_INTERVAL = 1000; // 1 second normal for localnet
const LOCALNET_FAST_POLL_INTERVAL = 300; // 300ms when close to round end on localnet
const BACKOFF_MULTIPLIER = 2; // Double backoff on rate limit
const MAX_BACKOFF = 60000; // Max 60 second backoff
const INITIAL_BACKOFF = 10000; // Start with 10 second backoff on error

// Board account layout offsets (8-byte discriminator + fields)
// Based on ore_api::state::Board struct
const BOARD_ROUND_ID_OFFSET = 8;
const BOARD_ROUND_SLOTS_OFFSET = 16;

// Round account layout (based on ore_api::state::Round)
// After 8-byte discriminator:
// id: u64 (8)
// deployed: [u64; 36] (288)
// slot_hash: [u8; 32] (32)
// count: [u64; 36] (288)
// expires_at: u64 (8)
// motherlode: u64 (8)
// rent_payer: Pubkey (32)
// top_miner: Pubkey (32)
// top_miner_reward: u64 (8)
// total_deployed: u64 (8)
// total_vaulted: u64 (8)
// total_winnings: u64 (8)

const ROUND_ID_OFFSET = 8;
const ROUND_DEPLOYED_OFFSET = 16;
const ROUND_SLOT_HASH_OFFSET = 16 + 36 * 8; // 304
const ROUND_COUNT_OFFSET = ROUND_SLOT_HASH_OFFSET + 32; // 336
const ROUND_EXPIRES_AT_OFFSET = ROUND_COUNT_OFFSET + 36 * 8; // 624
const ROUND_MOTHERLODE_OFFSET = ROUND_EXPIRES_AT_OFFSET + 8; // 632
const ROUND_RENT_PAYER_OFFSET = ROUND_MOTHERLODE_OFFSET + 8; // 640
const ROUND_TOP_MINER_OFFSET = ROUND_RENT_PAYER_OFFSET + 32; // 672
const ROUND_TOTAL_DEPLOYED_OFFSET = ROUND_TOP_MINER_OFFSET + 32 + 8; // 712
const ROUND_TOTAL_WINNINGS_OFFSET = ROUND_TOTAL_DEPLOYED_OFFSET + 8 + 8; // After total_deployed (8) + total_vaulted (8)

// Calculate RNG from slot_hash (same as Rust: XOR 4 u64 segments)
function calculateRng(slotHash: Uint8Array): bigint | null {
  // Check if slot_hash is all zeros or all max (not set)
  if (slotHash.every((b) => b === 0) || slotHash.every((b) => b === 255)) {
    return null;
  }

  const view = new DataView(slotHash.buffer, slotHash.byteOffset, 32);
  const r1 = view.getBigUint64(0, true);
  const r2 = view.getBigUint64(8, true);
  const r3 = view.getBigUint64(16, true);
  const r4 = view.getBigUint64(24, true);

  return r1 ^ r2 ^ r3 ^ r4;
}

// Calculate winning square from RNG
function calculateWinningSquare(rng: bigint): number {
  return Number(rng % BigInt(BOARD_SIZE));
}

function readU64(data: Uint8Array, offset: number): bigint {
  // Read 8 bytes as little-endian u64
  const view = new DataView(data.buffer, data.byteOffset + offset, 8);
  return view.getBigUint64(0, true); // true = little-endian
}

function readPubkey(data: Uint8Array, offset: number): string {
  const pubkeyBytes = data.slice(offset, offset + 32);
  // Check if all zeros (Pubkey::default())
  if (pubkeyBytes.every((b) => b === 0)) {
    return "";
  }
  // Simple hex representation for display
  const hex = Array.from(pubkeyBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 8) + "...";
}

export function useBoard() {
  // Use managed connection with automatic fallback instead of wallet adapter
  const [board, setBoard] = useState<BoardState | null>(null);
  const [round, setRound] = useState<RoundState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get network from store to determine polling intervals
  const { network } = useNetworkStore();
  const isLocalnet = network === "localnet";

  // Network-aware polling constants
  const MIN_POLL_INTERVAL = isLocalnet ? LOCALNET_MIN_POLL_INTERVAL : DEVNET_MIN_POLL_INTERVAL;
  const NORMAL_POLL_INTERVAL = isLocalnet ? LOCALNET_NORMAL_POLL_INTERVAL : DEVNET_NORMAL_POLL_INTERVAL;
  const FAST_POLL_INTERVAL = isLocalnet ? LOCALNET_FAST_POLL_INTERVAL : DEVNET_FAST_POLL_INTERVAL;

  // Rate limiting state
  const lastFetchRef = useRef<number>(0);
  const backoffRef = useRef<number>(MIN_POLL_INTERVAL);
  const fetchingRef = useRef<boolean>(false);
  const lastRoundIdRef = useRef<bigint | null>(null);
  const initialFetchDoneRef = useRef<boolean>(false);
  // FIXED: AbortController for cancelling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchBoard = useCallback(async (force = false) => {
    // Prevent concurrent fetches
    if (fetchingRef.current) {
      return;
    }

    // Rate limiting - don't fetch too frequently unless forced
    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchRef.current;
    if (!force && timeSinceLastFetch < backoffRef.current) {
      return;
    }

    // Cancel any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    fetchingRef.current = true;
    lastFetchRef.current = now;

    try {
      // Only show loading on initial fetch, not on subsequent polls
      // This prevents the loading spinner from flashing on every poll
      if (!initialFetchDoneRef.current) {
        setLoading(true);
      }
      setError(null);

      // Get board address first
      const [boardAddress] = boardPDA();

      // Use withFallback for automatic RPC failover
      const { boardAccount, currentSlot } = await withFallback(async (conn) => {
        const [boardAcc, slot] = await Promise.all([
          conn.getAccountInfo(boardAddress),
          conn.getSlot(),
        ]);
        return { boardAccount: boardAcc, currentSlot: slot };
      });

      if (!boardAccount) {
        setError("Board account not found. Program may not be initialized.");
        setBoard(null);
        setRound(null);
        return;
      }

      const boardData = new Uint8Array(boardAccount.data);
      const roundId = readU64(boardData, BOARD_ROUND_ID_OFFSET);
      const roundSlots = readU64(boardData, BOARD_ROUND_SLOTS_OFFSET);

      setBoard({
        roundId,
        roundSlots,
        currentSlot: BigInt(currentSlot),
      });

      // Only fetch round if round ID changed or we don't have round data
      const needsRoundFetch = lastRoundIdRef.current !== roundId || round === null;

      if (needsRoundFetch) {
        const [roundAddress] = roundPDA(roundId);

        // Use withFallback for round fetch too
        const roundAccount = await withFallback(async (conn) => {
          return conn.getAccountInfo(roundAddress);
        });

        if (roundAccount) {
          const roundData = new Uint8Array(roundAccount.data);

          // Parse deployed array
          const deployed: bigint[] = [];
          for (let i = 0; i < BOARD_SIZE; i++) {
            deployed.push(readU64(roundData, ROUND_DEPLOYED_OFFSET + i * 8));
          }

          // Parse count array
          const count: bigint[] = [];
          for (let i = 0; i < BOARD_SIZE; i++) {
            count.push(readU64(roundData, ROUND_COUNT_OFFSET + i * 8));
          }

          const expiresAt = readU64(roundData, ROUND_EXPIRES_AT_OFFSET);
          const motherlode = readU64(roundData, ROUND_MOTHERLODE_OFFSET);
          const topMiner = readPubkey(roundData, ROUND_TOP_MINER_OFFSET);
          const totalDeployed = readU64(roundData, ROUND_TOTAL_DEPLOYED_OFFSET);
          const totalWinnings = readU64(roundData, ROUND_TOTAL_WINNINGS_OFFSET);

          // Parse slot_hash
          const slotHash = roundData.slice(ROUND_SLOT_HASH_OFFSET, ROUND_SLOT_HASH_OFFSET + 32);

          // Calculate winning square if slot_hash is set
          let winningSquare: number | null = null;
          const rng = calculateRng(slotHash);
          if (rng !== null) {
            winningSquare = calculateWinningSquare(rng);
          }

          setRound({
            id: roundId,
            deployed,
            count,
            totalDeployed,
            expiresAt,
            motherlode,
            topMiner: topMiner || null,
            slotHash,
            winningSquare,
            totalWinnings,
          });

          lastRoundIdRef.current = roundId;
        } else {
          setRound(null);
          lastRoundIdRef.current = null;
        }
      } else {
        // Just update the currentSlot in existing round context
        // Round data stays the same, only slot changed
      }

      // Success - reset backoff
      backoffRef.current = MIN_POLL_INTERVAL;

    } catch (err) {
      // FIXED: Ignore aborted requests silently
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      console.error("Error fetching board:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch board";

      // Check for rate limiting (429) or any network error
      if (errorMessage.includes("429") || errorMessage.includes("rate limit") || errorMessage.includes("failed")) {
        const newBackoff = Math.max(INITIAL_BACKOFF, backoffRef.current * BACKOFF_MULTIPLIER);
        backoffRef.current = Math.min(newBackoff, MAX_BACKOFF);
        console.warn(`Rate limited - backing off to ${backoffRef.current}ms. Current RPC: ${getCurrentEndpoint()}`);
        // Don't show rate limit errors to user, just back off silently
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
      fetchingRef.current = false;
      initialFetchDoneRef.current = true;
    }
  // FIXED: Properly include dependencies to avoid stale closures
  }, [MIN_POLL_INTERVAL, round]);

  // Calculate time remaining until round expires
  const getTimeRemaining = useCallback(() => {
    if (!round || !board) return null;
    const slotsRemaining = Number(round.expiresAt) - Number(board.currentSlot);
    return slotsRemaining * 0.4; // Convert to seconds (400ms per slot)
  }, [round, board]);

  // Initial fetch and adaptive polling
  // IMPORTANT: Include `network` in dependencies to restart polling when network changes
  useEffect(() => {
    debug(`Starting polling for network: ${network}`);

    // FIXED: Track mounted state to prevent updates after unmount
    let isMounted = true;

    // Reset backoff and refs when network changes
    backoffRef.current = MIN_POLL_INTERVAL;
    lastRoundIdRef.current = null;
    initialFetchDoneRef.current = false;

    fetchBoard(true); // Force initial fetch

    // Use dynamic interval based on time remaining
    let timeoutId: NodeJS.Timeout;

    const schedulePoll = () => {
      // FIXED: Don't schedule if unmounted
      if (!isMounted) return;

      // Determine next poll interval based on time remaining
      const timeRemaining = getTimeRemaining();
      let pollInterval = NORMAL_POLL_INTERVAL;

      if (timeRemaining !== null && timeRemaining <= 10 && timeRemaining > 0) {
        // Poll faster when <10 seconds remaining (but still respecting min interval)
        pollInterval = FAST_POLL_INTERVAL;
      }

      // Apply current backoff if it's higher
      pollInterval = Math.max(pollInterval, backoffRef.current);

      timeoutId = setTimeout(() => {
        if (isMounted) {
          fetchBoard();
          schedulePoll();
        }
      }, pollInterval);
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
  // FIXED: Include all necessary dependencies
  }, [network, fetchBoard, getTimeRemaining, NORMAL_POLL_INTERVAL, FAST_POLL_INTERVAL, MIN_POLL_INTERVAL]);

  return {
    board,
    round,
    loading,
    error,
    refetch: fetchBoard,
    getTimeRemaining,
  };
}
