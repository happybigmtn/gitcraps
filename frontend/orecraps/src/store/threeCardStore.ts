import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { ThreeCardGame, ThreeCardPosition } from "@/lib/program";
import { ONE_TCP } from "@/lib/solana";

interface ThreeCardState {
  // On-chain state (fetched from RPC)
  threeCardGame: ThreeCardGame | null;
  threeCardPosition: ThreeCardPosition | null;
  isLoading: boolean;

  // Betting state
  anteBetAmount: number; // in TCP (display units)
  pairPlusBetAmount: number; // in TCP (display units)

  // Actions - State
  setThreeCardGame: (game: ThreeCardGame | null) => void;
  setThreeCardPosition: (position: ThreeCardPosition | null) => void;
  setIsLoading: (loading: boolean) => void;

  // Actions - Betting
  setAnteBetAmount: (amount: number) => void;
  setPairPlusBetAmount: (amount: number) => void;
  clearBets: () => void;
}

export const useThreeCardStore = create<ThreeCardState>()(
  persist(
    (set) => ({
      // Initial state
      threeCardGame: null,
      threeCardPosition: null,
      isLoading: false,
      anteBetAmount: 0.01,
      pairPlusBetAmount: 0,

      // State setters
      setThreeCardGame: (game) => set({ threeCardGame: game }),
      setThreeCardPosition: (position) => set({ threeCardPosition: position }),
      setIsLoading: (loading) => set({ isLoading: loading }),

      // Betting setters
      setAnteBetAmount: (amount) => set({ anteBetAmount: amount }),
      setPairPlusBetAmount: (amount) => set({ pairPlusBetAmount: amount }),
      clearBets: () => set({ anteBetAmount: 0.01, pairPlusBetAmount: 0 }),
    }),
    {
      name: "orecraps-threecard-store",
      partialize: (state) => ({
        anteBetAmount: state.anteBetAmount,
        pairPlusBetAmount: state.pairPlusBetAmount,
      }),
    }
  )
);

// ============================================================================
// BASIC STATE SELECTORS
// ============================================================================

export const useThreeCardGame = () => useThreeCardStore((state) => state.threeCardGame);
export const useThreeCardPosition = () => useThreeCardStore((state) => state.threeCardPosition);
export const useAnteBetAmount = () => useThreeCardStore((state) => state.anteBetAmount);
export const usePairPlusBetAmount = () => useThreeCardStore((state) => state.pairPlusBetAmount);
export const useThreeCardIsLoading = () => useThreeCardStore((state) => state.isLoading);

// ============================================================================
// DERIVED SELECTORS
// ============================================================================

// Get current epoch ID
export const useCurrentEpochId = () =>
  useThreeCardStore((state) => state.threeCardGame?.epochId ?? 0n);

// Get house bankroll in TCP
export const useThreeCardHouseBankroll = () =>
  useThreeCardStore((state) =>
    state.threeCardGame
      ? Number(state.threeCardGame.houseBankroll) / Number(ONE_TCP)
      : 0
  );

// Get pending winnings in TCP
export const useThreeCardPendingWinnings = () =>
  useThreeCardStore((state) =>
    state.threeCardPosition
      ? Number(state.threeCardPosition.pendingWinnings) / Number(ONE_TCP)
      : 0
  );

// Get game state
export const useThreeCardGameState = () =>
  useThreeCardStore((state) => state.threeCardPosition?.state ?? 0);

// Get if player can bet (game state is Betting)
export const useCanPlaceThreeCardBets = () => {
  const [canBet, reason] = useThreeCardStore(
    useShallow((state): [boolean, string | null] => {
      const game = state.threeCardGame;
      const position = state.threeCardPosition;

      if (!game) return [false, "Game not loaded"];
      if (position && position.state !== 0) {
        return [false, "Complete current game first"];
      }
      return [true, null];
    })
  );
  return { canBet, reason };
};

// Get if player can deal (game state is Betting and has ante bet)
export const useCanDealThreeCard = () => {
  const [canDeal, reason] = useThreeCardStore(
    useShallow((state): [boolean, string | null] => {
      const position = state.threeCardPosition;

      if (!position) return [false, "No position"];
      if (position.state !== 0) return [false, "Wrong game state"];
      if (position.ante === 0n) return [false, "No ante bet placed"];
      return [true, null];
    })
  );
  return { canDeal, reason };
};

// Get if player can play/fold (game state is Dealt)
export const useCanPlayOrFold = () => {
  const [canAct, reason] = useThreeCardStore(
    useShallow((state): [boolean, string | null] => {
      const position = state.threeCardPosition;

      if (!position) return [false, "No position"];
      if (position.state !== 1) return [false, "Cards not dealt"];
      return [true, null];
    })
  );
  return { canAct, reason };
};

// Format TCP base units to TCP display
export function formatTcpBaseUnits(amount: bigint): string {
  return (Number(amount) / Number(ONE_TCP)).toFixed(4);
}
