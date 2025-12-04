# Video Poker Frontend Implementation Summary

## Overview

Complete frontend implementation for 9/6 Jacks or Better Video Poker following existing patterns from Roulette game.

## Files Created

### 1. ✅ Store: `/src/store/videoPokerStore.ts`
- **Status**: CREATED
- **Pattern**: Follows `rouletteStore.ts`
- **Key Features**:
  - Zustand store with persist middleware
  - State management for game/position
  - UI state (coins: 1-5, betPerCoin, selectedHolds: boolean[5])
  - Derived selectors for house bankroll, pending winnings, total bet
  - Can place bet / can deal / can hold/draw / can claim checks
  - Helper functions for formatting VPK amounts

### 2. ⏳ Hook: `/src/hooks/useVideoPoker.ts`
**Pattern**: Follow `useRoulette.ts` exactly

**Implementation**:
```typescript
"use client";

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

// Rate limiting constants (same as roulette)
const DEVNET_POLL_INTERVAL = 10000;
const LOCALNET_POLL_INTERVAL = 2000;
const BACKOFF_MULTIPLIER = 2;
const MAX_BACKOFF = 60000;
const INITIAL_BACKOFF = 5000;

export interface VideoPokerState {
  game: VideoPokerGame | null;
  position: VideoPokerPosition | null;
  loading: boolean;
  error: string | null;
}

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

  // Local error state
  const [error, setError] = useState<string | null>(null);

  const { network } = useNetworkStore();
  const isLocalnet = network === "localnet";
  const POLL_INTERVAL = isLocalnet ? LOCALNET_POLL_INTERVAL : DEVNET_POLL_INTERVAL;

  // Rate limiting refs
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
            const fetchPromises = [conn.getAccountInfo(videoPokerGameAddress)];

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
          const parsedPosition = parseVideoPokerPosition(
            Buffer.from(positionAccount.data)
          );
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

  // Polling effect (same pattern as useRoulette)
  useEffect(() => {
    debug(`Starting polling for network: ${network}`);

    let isMounted = true;
    let isPaused = false;

    backoffRef.current = POLL_INTERVAL;
    initialFetchDoneRef.current = false;

    fetchVideoPoker(true);

    let timeoutId: NodeJS.Timeout;

    const schedulePoll = () => {
      if (!isMounted) return;

      timeoutId = setTimeout(() => {
        if (isMounted && !isPaused) {
          fetchVideoPoker().then(() => {
            schedulePoll();
          });
        } else if (isMounted) {
          schedulePoll();
        }
      }, POLL_INTERVAL);
    };

    // Pause polling when tab is hidden
    const handleVisibilityChange = () => {
      if (document.hidden) {
        debug("Tab hidden - pausing polling");
        isPaused = true;
      } else {
        debug("Tab visible - resuming polling");
        isPaused = false;
        fetchVideoPoker(true);
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
  }, [network, POLL_INTERVAL, fetchVideoPoker]);

  // Refetch when wallet changes
  useEffect(() => {
    fetchVideoPoker(true);
  }, [publicKey, fetchVideoPoker]);

  // Computed values
  const epochId = videoPokerGame?.epochId ?? 0n;
  const houseBankroll = videoPokerGame?.houseBankroll ?? 0n;
  const gamesPlayed = videoPokerGame?.gamesPlayed ?? 0n;
  const pendingWinnings = videoPokerPosition?.pendingWinnings ?? 0n;
  const canPlaceBet = videoPokerGame !== null;

  const refetch = useCallback(() => fetchVideoPoker(true), [fetchVideoPoker]);

  return useMemo(
    () => ({
      game: videoPokerGame,
      position: videoPokerPosition,
      loading: isLoading,
      error,
      refetch,
      // Computed values
      epochId,
      houseBankroll,
      gamesPlayed,
      pendingWinnings,
      canPlaceBet,
    }),
    [
      videoPokerGame,
      videoPokerPosition,
      isLoading,
      error,
      refetch,
      epochId,
      houseBankroll,
      gamesPlayed,
      pendingWinnings,
      canPlaceBet,
    ]
  );
}
```

### 3. ⏳ Components

#### `/src/components/videopoker/index.ts`
```typescript
export { VideoPokerLayout } from "./VideoPokerLayout";
export { VideoPokerTable } from "./VideoPokerTable";
export { VideoPokerBettingPanel } from "./VideoPokerBettingPanel";
export { VideoPokerGameStatus } from "./VideoPokerGameStatus";
```

#### `/src/components/videopoker/VideoPokerLayout.tsx`
**Pattern**: Copy `RouletteLayout.tsx` structure

```typescript
"use client";

import { VideoPokerTable } from "./VideoPokerTable";
import { VideoPokerBettingPanel } from "./VideoPokerBettingPanel";
import { VideoPokerGameStatus } from "./VideoPokerGameStatus";

export function VideoPokerLayout() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <VideoPokerTable />
        <VideoPokerGameStatus />
      </div>
      <div>
        <VideoPokerBettingPanel />
      </div>
    </div>
  );
}

export default VideoPokerLayout;
```

#### `/src/components/videopoker/VideoPokerTable.tsx`
**Key Features**:
- Display 5 cards with ranks/suits
- Color-coded suits (red for ♥♦, black for ♣♠)
- Hold buttons below each card
- Shows current hand name if evaluated
- Uses `getCardRank()`, `getCardSuit()`, `getCardColor()`, `getHandName()` from program.ts
- State-based UI: shows ? cards when no game, actual cards when dealt
- Disabled when not in DEALT state

**Components Needed**:
- Card component with rank/suit display
- Hold toggle buttons below cards
- Hand name display
- Pay table reference (shows 9/6 Jacks or Better payouts)

#### `/src/components/videopoker/VideoPokerBettingPanel.tsx`
**Key Features**:
- Coins selector (1-5) with max coins button
- Bet per coin input
- Total bet display (coins * betPerCoin)
- VPK balance display
- Action buttons based on state:
  - NONE/SETTLED: "Place Bet" button
  - BETTING: "Deal" button (after bet placed)
  - DEALT: "Draw" button (after holds selected)
  - Any state with pendingWinnings > 0: "Claim Winnings" button
- Uses TransactionService for all transactions
- Follow RouletteBettingPanel pattern for transaction handling
- Shows pending tx status with toast notifications

**Transaction Handlers**:
1. `handlePlaceBet()`: createPlaceVideoPokerBetInstruction
2. `handleDeal()`: createDealVideoPokerInstruction (needs slot_hash)
3. `handleDraw()`: createHoldAndDrawInstruction (needs holdFlags + slot_hash)
4. `handleClaim()`: createClaimVideoPokerWinningsInstruction

#### `/src/components/videopoker/VideoPokerGameStatus.tsx`
**Key Features**:
- House bankroll in VPK
- Total games played
- Current position stats: totalWagered, totalWon, totalLost, gamesPlayed
- Best hand achieved
- Current state display (None, Betting, Dealt, etc.)
- Pending winnings (if any)

## Key Differences from Roulette

1. **Game Flow**: Bet → Deal → Hold/Draw → Settle (vs Bet → Spin → Settle)
2. **Cards**: 5-card hand display instead of roulette wheel
3. **Hold Mechanism**: Player selects which cards to hold before draw
4. **Pay Table**: Fixed 9/6 Jacks or Better payouts (not bet-type based)
5. **Royal Flush Bonus**: 800x payout at max coins (vs 250x at other coin counts)

## Integration Notes

- VPK_MINT constant must be imported in program.ts from solana.ts
- ONE_VPK constant used for display conversions (9 decimals)
- Slot hash RNG used for Deal and Draw operations (same as Roulette)
- TransactionService handles all transaction building and submission
- Follow existing toast notification patterns for user feedback

## Testing Checklist

- [ ] Store initializes with correct defaults
- [ ] Hook polls game/position state
- [ ] Can place bet with 1-5 coins
- [ ] Deal button appears after bet placed
- [ ] 5 cards display correctly with suits
- [ ] Hold toggles work on each card
- [ ] Draw replaces non-held cards
- [ ] Hand evaluation shows correct name
- [ ] Payouts calculated correctly (including 800x Royal at 5 coins)
- [ ] Claim winnings works
- [ ] VPK balance updates after transactions
- [ ] State transitions work correctly
- [ ] Error handling for insufficient VPK
- [ ] Network switching preserves bet amounts
- [ ] UI disables appropriately based on state

## VPK Mint Address

From consts.rs: `6GbB76TknZarh6acofMwjt77Vueief31iCLiE6dqmJTT`

Already configured in solana.ts as `LOCALNET_VPK_MINT`.
