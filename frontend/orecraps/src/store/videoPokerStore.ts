import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import {
  VideoPokerGame,
  VideoPokerPosition,
  VP_STATE_NONE,
  VP_STATE_BETTING,
  VP_STATE_DEALT,
  VP_STATE_HELD,
  VP_STATE_SETTLED,
} from "@/lib/program";
import { ONE_VPK } from "@/lib/solana";

interface VideoPokerState {
  // On-chain state (fetched from RPC)
  videoPokerGame: VideoPokerGame | null;
  videoPokerPosition: VideoPokerPosition | null;
  isLoading: boolean;

  // UI state
  coins: number; // 1-5
  betPerCoin: number; // in VPK (display units)
  selectedHolds: boolean[]; // 5 booleans for hold flags

  // Actions - State
  setVideoPokerGame: (game: VideoPokerGame | null) => void;
  setVideoPokerPosition: (position: VideoPokerPosition | null) => void;
  setIsLoading: (loading: boolean) => void;

  // Actions - Betting
  setCoins: (coins: number) => void;
  setBetPerCoin: (amount: number) => void;
  toggleHold: (index: number) => void;
  clearHolds: () => void;
  setHolds: (holds: boolean[]) => void;
}

export const useVideoPokerStore = create<VideoPokerState>()(
  persist(
    (set) => ({
      // Initial state
      videoPokerGame: null,
      videoPokerPosition: null,
      isLoading: false,
      coins: 5, // Default to max coins for best Royal Flush payout
      betPerCoin: 0.01,
      selectedHolds: [false, false, false, false, false],

      // State setters
      setVideoPokerGame: (game) => set({ videoPokerGame: game }),
      setVideoPokerPosition: (position) => set({ videoPokerPosition: position }),
      setIsLoading: (loading) => set({ isLoading: loading }),

      // Betting setters
      setCoins: (coins) => set({ coins: Math.max(1, Math.min(5, coins)) }),
      setBetPerCoin: (amount) => set({ betPerCoin: amount }),
      toggleHold: (index) =>
        set((state) => ({
          selectedHolds: state.selectedHolds.map((held, i) =>
            i === index ? !held : held
          ),
        })),
      clearHolds: () => set({ selectedHolds: [false, false, false, false, false] }),
      setHolds: (holds) => set({ selectedHolds: holds }),
    }),
    {
      name: "orecraps-videopoker-store",
      partialize: (state) => ({
        coins: state.coins,
        betPerCoin: state.betPerCoin,
      }),
    }
  )
);

// ============================================================================
// BASIC STATE SELECTORS
// ============================================================================

export const useVideoPokerGame = () => useVideoPokerStore((state) => state.videoPokerGame);
export const useVideoPokerPosition = () => useVideoPokerStore((state) => state.videoPokerPosition);
export const useVideoPokerCoins = () => useVideoPokerStore((state) => state.coins);
export const useVideoPokerBetPerCoin = () => useVideoPokerStore((state) => state.betPerCoin);
export const useVideoPokerSelectedHolds = () => useVideoPokerStore((state) => state.selectedHolds);
export const useVideoPokerIsLoading = () => useVideoPokerStore((state) => state.isLoading);

// ============================================================================
// DERIVED SELECTORS
// ============================================================================

// Get house bankroll in VPK
export const useVideoPokerHouseBankroll = () =>
  useVideoPokerStore((state) =>
    state.videoPokerGame
      ? Number(state.videoPokerGame.houseBankroll) / Number(ONE_VPK)
      : 0
  );

// Get pending winnings in VPK
export const useVideoPokerPendingWinnings = () =>
  useVideoPokerStore((state) =>
    state.videoPokerPosition
      ? Number(state.videoPokerPosition.pendingWinnings) / Number(ONE_VPK)
      : 0
  );

// Get total bet amount
export const useVideoPokerTotalBet = () =>
  useVideoPokerStore((state) => state.coins * state.betPerCoin);

// Get current game state
export const useVideoPokerState = () =>
  useVideoPokerStore((state) => state.videoPokerPosition?.state ?? VP_STATE_NONE);

// Check if can place bet
const selectCanPlaceBet = (state: VideoPokerState): [boolean, string | null] => {
  const game = state.videoPokerGame;
  const position = state.videoPokerPosition;

  if (!game) return [false, "Game not loaded"];
  if (position && position.state !== VP_STATE_NONE && position.state !== VP_STATE_SETTLED) {
    return [false, "Finish current game first"];
  }

  return [true, null];
};

export const useCanPlaceVideoPokerBet = () => {
  const [canBet, reason] = useVideoPokerStore(useShallow(selectCanPlaceBet));
  return { canBet, reason };
};

// Check if can deal
const selectCanDeal = (state: VideoPokerState): [boolean, string | null] => {
  const position = state.videoPokerPosition;
  if (!position) return [false, "No position"];
  if (position.state !== VP_STATE_BETTING) return [false, "Must place bet first"];
  return [true, null];
};

export const useCanDealVideoPoker = () => {
  const [canDeal, reason] = useVideoPokerStore(useShallow(selectCanDeal));
  return { canDeal, reason };
};

// Check if can hold/draw
const selectCanHoldDraw = (state: VideoPokerState): [boolean, string | null] => {
  const position = state.videoPokerPosition;
  if (!position) return [false, "No position"];
  if (position.state !== VP_STATE_DEALT) return [false, "Must deal cards first"];
  return [true, null];
};

export const useCanHoldDrawVideoPoker = () => {
  const [canHoldDraw, reason] = useVideoPokerStore(useShallow(selectCanHoldDraw));
  return { canHoldDraw, reason };
};

// Check if can claim
export const useCanClaimVideoPoker = () =>
  useVideoPokerStore((state) => {
    const position = state.videoPokerPosition;
    return position && position.pendingWinnings > 0n;
  });

// Format VPK base units to VPK display
export function formatVpkBaseUnits(amount: bigint): string {
  return (Number(amount) / Number(ONE_VPK)).toFixed(4);
}
