import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { WarGame, WarPosition } from "@/lib/program";
import { ONE_WAR } from "@/lib/solana";

// Pending bet before it's sent to chain
export interface PendingWarBet {
  anteBet: number; // in WAR (display units)
  tieBet: number; // in WAR (display units)
}

interface WarState {
  // On-chain state (fetched from RPC)
  warGame: WarGame | null;
  warPosition: WarPosition | null;
  isLoading: boolean;

  // Pending bet (not yet on chain)
  pendingBet: PendingWarBet | null;
  betAmount: number; // Default ante amount in WAR

  // Actions - State
  setWarGame: (game: WarGame | null) => void;
  setWarPosition: (position: WarPosition | null) => void;
  setIsLoading: (loading: boolean) => void;

  // Actions - Betting
  setBetAmount: (amount: number) => void;
  setPendingBet: (bet: PendingWarBet | null) => void;
  clearPendingBet: () => void;
}

export const useWarStore = create<WarState>()(
  persist(
    (set) => ({
      // Initial state
      warGame: null,
      warPosition: null,
      isLoading: false,
      pendingBet: null,
      betAmount: 0.01,

      // State setters
      setWarGame: (game) => set({ warGame: game }),
      setWarPosition: (position) => set({ warPosition: position }),
      setIsLoading: (loading) => set({ isLoading: loading }),

      // Betting setters
      setBetAmount: (amount) => set({ betAmount: amount }),
      setPendingBet: (bet) => set({ pendingBet: bet }),
      clearPendingBet: () => set({ pendingBet: null }),
    }),
    {
      name: "orecraps-war-store",
      partialize: (state) => ({
        betAmount: state.betAmount,
      }),
    }
  )
);

// ============================================================================
// BASIC STATE SELECTORS
// ============================================================================

// Core state selectors
export const useWarGame = () => useWarStore((state) => state.warGame);
export const useWarPosition = () => useWarStore((state) => state.warPosition);
export const useWarPendingBet = () => useWarStore((state) => state.pendingBet);
export const useWarBetAmount = () => useWarStore((state) => state.betAmount);
export const useWarIsLoading = () => useWarStore((state) => state.isLoading);

// ============================================================================
// DERIVED SELECTORS
// ============================================================================

// Get current epoch ID
export const useWarEpochId = () =>
  useWarStore((state) => state.warGame?.epochId ?? 0n);

// Get house bankroll in WAR
export const useWarHouseBankroll = () =>
  useWarStore((state) =>
    state.warGame
      ? Number(state.warGame.houseBankroll) / Number(ONE_WAR)
      : 0
  );

// Get pending winnings in WAR
export const useWarPendingWinnings = () =>
  useWarStore((state) =>
    state.warPosition
      ? Number(state.warPosition.pendingWinnings) / Number(ONE_WAR)
      : 0
  );

// Get current game state
export const useWarGameState = () =>
  useWarStore((state) => state.warPosition?.state ?? 0);

// Stable selector for canPlaceBets
const selectCanPlaceBets = (state: WarState): [boolean, string | null] => {
  const game = state.warGame;
  const position = state.warPosition;

  if (!game) return [false, "Game not loaded"];

  // Can only place bet if no active game (state === 0) or game is settled (state === 3)
  if (position && position.state !== 0 && position.state !== 3) {
    return [false, "Complete current game first"];
  }

  return [true, null];
};

// Check if game is ready for bets
export const useCanPlaceWarBets = () => {
  const [canBet, reason] = useWarStore(useShallow(selectCanPlaceBets));
  return { canBet, reason };
};

// Check if can deal cards
export const useCanDealWar = () =>
  useWarStore((state) => {
    const position = state.warPosition;
    // Can deal if there's a bet placed (state would be 0 with ante > 0)
    return position && position.state === 0 && position.anteBet > 0n;
  });

// Check if in war state (can go to war or surrender)
export const useIsWarState = () =>
  useWarStore((state) => state.warPosition?.state === 1); // 1 = Dealt state with tie

// Check if can claim winnings
export const useCanClaimWarWinnings = () =>
  useWarStore((state) => {
    const position = state.warPosition;
    return position && position.pendingWinnings > 0n;
  });

// Format WAR base units to WAR display
export function formatWarBaseUnits(amount: bigint): string {
  return (Number(amount) / Number(ONE_WAR)).toFixed(4);
}
