import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import {
  RouletteBetType,
  RouletteGame,
  RoulettePosition,
  getRouletteBetDisplayInfo,
} from "@/lib/program";
import { ONE_ROUL } from "@/lib/solana";

// Pending bet before it's sent to chain
export interface PendingRouletteBet {
  betType: RouletteBetType;
  betIndex: number; // For straight up (0-37) or dozen/column (0-2)
  amount: number; // in ROUL (display units)
}

// Spin result for display
export interface SpinResult {
  number: number;
  timestamp: number;
}

interface RouletteState {
  // On-chain state (fetched from RPC)
  rouletteGame: RouletteGame | null;
  roulettePosition: RoulettePosition | null;
  isLoading: boolean;

  // Last spin result for display
  lastSpinResult: SpinResult | null;

  // Pending bets (not yet on chain)
  pendingBets: PendingRouletteBet[];
  betAmount: number; // Default amount in ROUL

  // UI state
  selectedNumber: number | null; // For straight up bets

  // Actions - State
  setRouletteGame: (game: RouletteGame | null) => void;
  setRoulettePosition: (position: RoulettePosition | null) => void;
  setIsLoading: (loading: boolean) => void;

  // Actions - Spin result
  setLastSpinResult: (result: SpinResult | null) => void;
  clearLastSpinResult: () => void;

  // Actions - Betting
  setBetAmount: (amount: number) => void;
  setSelectedNumber: (num: number | null) => void;
  addPendingBet: (bet: PendingRouletteBet) => void;
  removePendingBet: (index: number) => void;
  clearPendingBets: () => void;

  // Actions - Quick bets
  addStraightUpBet: (num: number, amount?: number) => void;
  addRedBet: (amount?: number) => void;
  addBlackBet: (amount?: number) => void;
  addOddBet: (amount?: number) => void;
  addEvenBet: (amount?: number) => void;
  addLowBet: (amount?: number) => void;
  addHighBet: (amount?: number) => void;
  addDozenBet: (dozen: number, amount?: number) => void;
  addColumnBet: (column: number, amount?: number) => void;
}

export const useRouletteStore = create<RouletteState>()(
  persist(
    (set) => ({
      // Initial state
      rouletteGame: null,
      roulettePosition: null,
      isLoading: false,
      lastSpinResult: null,
      pendingBets: [],
      betAmount: 0.01,
      selectedNumber: null,

      // State setters
      setRouletteGame: (game) => set({ rouletteGame: game }),
      setRoulettePosition: (position) => set({ roulettePosition: position }),
      setIsLoading: (loading) => set({ isLoading: loading }),

      // Spin result
      setLastSpinResult: (result) => set({ lastSpinResult: result }),
      clearLastSpinResult: () => set({ lastSpinResult: null }),

      // Betting setters
      setBetAmount: (amount) => set({ betAmount: amount }),
      setSelectedNumber: (num) => set({ selectedNumber: num }),

      addPendingBet: (bet) =>
        set((state) => ({
          pendingBets: [...state.pendingBets, bet],
        })),

      removePendingBet: (index) =>
        set((state) => ({
          pendingBets: state.pendingBets.filter((_, i) => i !== index),
        })),

      clearPendingBets: () => set({ pendingBets: [] }),

      // Quick bet helpers
      addStraightUpBet: (num, amount) => {
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: RouletteBetType.StraightUp,
              betIndex: num,
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      addRedBet: (amount) => {
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: RouletteBetType.Red,
              betIndex: 0,
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      addBlackBet: (amount) => {
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: RouletteBetType.Black,
              betIndex: 0,
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      addOddBet: (amount) => {
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: RouletteBetType.Odd,
              betIndex: 0,
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      addEvenBet: (amount) => {
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: RouletteBetType.Even,
              betIndex: 0,
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      addLowBet: (amount) => {
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: RouletteBetType.Low,
              betIndex: 0,
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      addHighBet: (amount) => {
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: RouletteBetType.High,
              betIndex: 0,
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      addDozenBet: (dozen, amount) => {
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: RouletteBetType.Dozen,
              betIndex: dozen,
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      addColumnBet: (column, amount) => {
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: RouletteBetType.Column,
              betIndex: column,
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },
    }),
    {
      name: "orecraps-roulette-store",
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
export const useRouletteGame = () => useRouletteStore((state) => state.rouletteGame);
export const useRoulettePosition = () => useRouletteStore((state) => state.roulettePosition);
export const useRoulettePendingBets = () => useRouletteStore((state) => state.pendingBets);
export const useRouletteBetAmount = () => useRouletteStore((state) => state.betAmount);
export const useSelectedRouletteNumber = () => useRouletteStore((state) => state.selectedNumber);
export const useRouletteIsLoading = () => useRouletteStore((state) => state.isLoading);
export const useLastRouletteSpinResult = () => useRouletteStore((state) => state.lastSpinResult);

// ============================================================================
// DERIVED SELECTORS
// ============================================================================

// Get current epoch ID
export const useCurrentEpochId = () =>
  useRouletteStore((state) => state.rouletteGame?.epochId ?? 0n);

// Get house bankroll in ROUL
export const useRouletteHouseBankroll = () =>
  useRouletteStore((state) =>
    state.rouletteGame
      ? Number(state.rouletteGame.houseBankroll) / Number(ONE_ROUL)
      : 0
  );

// Get pending winnings in ROUL
export const useRoulettePendingWinnings = () =>
  useRouletteStore((state) =>
    state.roulettePosition
      ? Number(state.roulettePosition.pendingWinnings) / Number(ONE_ROUL)
      : 0
  );

// Get total pending bet amount
export const useRouletteTotalPendingAmount = () =>
  useRouletteStore((state) =>
    state.pendingBets.reduce((sum, bet) => sum + bet.amount, 0)
  );

// Get count of pending bets
export const useRoulettePendingBetCount = () =>
  useRouletteStore((state) => state.pendingBets.length);

// Stable selector for canPlaceBets
const selectCanPlaceBets = (state: RouletteState): [boolean, string | null] => {
  const game = state.rouletteGame;
  if (!game) return [false, "Game not loaded"];
  // Roulette is always ready for bets (single-player, no rounds)
  return [true, null];
};

// Check if game is ready for bets
export const useCanPlaceRouletteBets = () => {
  const [canBet, reason] = useRouletteStore(useShallow(selectCanPlaceBets));
  return { canBet, reason };
};

// Get last result name
export const useLastResultName = () =>
  useRouletteStore((state) => {
    const game = state.rouletteGame;
    if (!game || game.lastResult === 255) return null;
    if (game.lastResult === 37) return "00";
    return game.lastResult.toString();
  });

// ============================================================================
// BET INFO HELPERS
// ============================================================================

// Get bet type name
export function getRouletteBetTypeName(betType: RouletteBetType, betIndex: number): string {
  switch (betType) {
    case RouletteBetType.StraightUp:
      return betIndex === 37 ? "00" : betIndex.toString();
    case RouletteBetType.Dozen:
      return `${betIndex + 1}st Dozen`;
    case RouletteBetType.Column:
      return `${betIndex + 1}st Column`;
    default:
      return getRouletteBetDisplayInfo(betType).name;
  }
}

// Format ROUL base units to ROUL display
export function formatRoulBaseUnits(amount: bigint): string {
  return (Number(amount) / Number(ONE_ROUL)).toFixed(4);
}

// Get total active bets for a position
export function getTotalActiveBets(position: RoulettePosition): bigint {
  let total = position.red +
    position.black +
    position.odd +
    position.even +
    position.low +
    position.high;

  for (let i = 0; i < 38; i++) {
    total += position.straightUp[i];
  }

  for (let i = 0; i < 16; i++) {
    total += position.splits[i];
  }

  for (let i = 0; i < 3; i++) {
    total += position.dozens[i] + position.columns[i];
  }

  return total;
}

// Check if position has any active bets
export function hasActiveBets(position: RoulettePosition | null): boolean {
  if (!position) return false;
  return getTotalActiveBets(position) > 0n;
}
