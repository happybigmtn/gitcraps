import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import {
  UTHGame,
  UTHPosition,
  UTHPhase,
  getUTHPhaseName,
} from "@/lib/program";
import { ONE_UTH } from "@/lib/solana";

interface UTHState {
  // On-chain state (fetched from RPC)
  uthGame: UTHGame | null;
  uthPosition: UTHPosition | null;
  isLoading: boolean;

  // UI state
  anteAmount: number; // in UTH (display units)
  blindAmount: number; // in UTH (display units)
  tripsAmount: number; // in UTH (display units)

  // Actions - State
  setUTHGame: (game: UTHGame | null) => void;
  setUTHPosition: (position: UTHPosition | null) => void;
  setIsLoading: (loading: boolean) => void;

  // Actions - Betting
  setAnteAmount: (amount: number) => void;
  setBlindAmount: (amount: number) => void;
  setTripsAmount: (amount: number) => void;
}

export const useUTHStore = create<UTHState>()(
  persist(
    (set) => ({
      // Initial state
      uthGame: null,
      uthPosition: null,
      isLoading: false,
      anteAmount: 0.01,
      blindAmount: 0.01,
      tripsAmount: 0,

      // State setters
      setUTHGame: (game) => set({ uthGame: game }),
      setUTHPosition: (position) => set({ uthPosition: position }),
      setIsLoading: (loading) => set({ isLoading: loading }),

      // Betting setters
      setAnteAmount: (amount) => set({ anteAmount: amount }),
      setBlindAmount: (amount) => set({ blindAmount: amount }),
      setTripsAmount: (amount) => set({ tripsAmount: amount }),
    }),
    {
      name: "orecraps-uth-store",
      partialize: (state) => ({
        anteAmount: state.anteAmount,
        blindAmount: state.blindAmount,
        tripsAmount: state.tripsAmount,
      }),
    }
  )
);

// ============================================================================
// BASIC STATE SELECTORS
// ============================================================================

// Core state selectors
export const useUTHGame = () => useUTHStore((state) => state.uthGame);
export const useUTHPosition = () => useUTHStore((state) => state.uthPosition);
export const useUTHIsLoading = () => useUTHStore((state) => state.isLoading);
export const useAnteAmount = () => useUTHStore((state) => state.anteAmount);
export const useBlindAmount = () => useUTHStore((state) => state.blindAmount);
export const useTripsAmount = () => useUTHStore((state) => state.tripsAmount);

// ============================================================================
// DERIVED SELECTORS
// ============================================================================

// Get current epoch ID
export const useCurrentUTHEpochId = () =>
  useUTHStore((state) => state.uthGame?.epochId ?? 0n);

// Get house bankroll in UTH
export const useUTHHouseBankroll = () =>
  useUTHStore((state) =>
    state.uthGame
      ? Number(state.uthGame.houseBankroll) / Number(ONE_UTH)
      : 0
  );

// Get pending winnings in UTH
export const useUTHPendingWinnings = () =>
  useUTHStore((state) =>
    state.uthPosition
      ? Number(state.uthPosition.pendingWinnings) / Number(ONE_UTH)
      : 0
  );

// Get current game phase
export const useUTHPhase = () =>
  useUTHStore((state) => state.uthPosition?.phase ?? UTHPhase.Betting);

// Get current phase name
export const useUTHPhaseName = () =>
  useUTHStore((state) =>
    state.uthPosition ? getUTHPhaseName(state.uthPosition.phase) : "Betting"
  );

// Check if game is ready for new ante
const selectCanPlaceAnte = (state: UTHState): [boolean, string | null] => {
  const game = state.uthGame;
  const position = state.uthPosition;

  if (!game) return [false, "Game not loaded"];
  if (!position) return [true, null]; // No position means first bet

  // Can place ante if in Betting phase
  if (position.phase === UTHPhase.Betting) {
    return [true, null];
  }

  return [false, `In ${getUTHPhaseName(position.phase)} phase`];
};

export const useCanPlaceAnte = () => {
  const [canBet, reason] = useUTHStore(useShallow(selectCanPlaceAnte));
  return { canBet, reason };
};

// Check if can bet preflop (4x)
const selectCanBetPreflop = (state: UTHState): [boolean, string | null] => {
  const position = state.uthPosition;
  if (!position) return [false, "No active game"];
  if (position.phase !== UTHPhase.Preflop) return [false, "Not in preflop phase"];
  if (position.play > 0n) return [false, "Already placed play bet"];
  return [true, null];
};

export const useCanBetPreflop = () => {
  const [canBet, reason] = useUTHStore(useShallow(selectCanBetPreflop));
  return { canBet, reason };
};

// Check if can bet flop (2x)
const selectCanBetFlop = (state: UTHState): [boolean, string | null] => {
  const position = state.uthPosition;
  if (!position) return [false, "No active game"];
  if (position.phase !== UTHPhase.Flop) return [false, "Not in flop phase"];
  if (position.play > 0n) return [false, "Already placed play bet"];
  return [true, null];
};

export const useCanBetFlop = () => {
  const [canBet, reason] = useUTHStore(useShallow(selectCanBetFlop));
  return { canBet, reason };
};

// Check if can bet river (1x or fold)
const selectCanBetRiver = (state: UTHState): [boolean, string | null] => {
  const position = state.uthPosition;
  if (!position) return [false, "No active game"];
  if (position.phase !== UTHPhase.River) return [false, "Not in river phase"];
  if (position.play > 0n) return [false, "Already placed play bet"];
  return [true, null];
};

export const useCanBetRiver = () => {
  const [canBet, reason] = useUTHStore(useShallow(selectCanBetRiver));
  return { canBet, reason };
};

// Get total bets (for display)
export const useUTHTotalBets = () =>
  useUTHStore((state) => {
    const pos = state.uthPosition;
    if (!pos) return 0;
    return (
      Number(pos.ante + pos.blind + pos.trips + pos.play) / Number(ONE_UTH)
    );
  });

// Format UTH base units to display
export function formatUTHBaseUnits(amount: bigint): string {
  return (Number(amount) / Number(ONE_UTH)).toFixed(4);
}
