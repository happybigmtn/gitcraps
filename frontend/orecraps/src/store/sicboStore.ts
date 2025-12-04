import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import {
  SicBoBetType,
  SicBoGame,
  SicBoPosition,
  getSicBoBetDisplayInfo,
} from "@/lib/program";
import { ONE_SICO } from "@/lib/solana";

// Pending bet before it's sent to chain
export interface PendingSicBoBet {
  betType: SicBoBetType;
  betIndex: number;
  amount: number; // in SICO (display units)
}

// Roll result for display
export interface RollResult {
  dice: number[]; // 3 dice values (1-6)
  sum: number;
  timestamp: number;
}

interface SicBoState {
  // On-chain state (fetched from RPC)
  sicboGame: SicBoGame | null;
  sicboPosition: SicBoPosition | null;
  isLoading: boolean;

  // Last roll result for display
  lastRollResult: RollResult | null;

  // Pending bets (not yet on chain)
  pendingBets: PendingSicBoBet[];
  betAmount: number; // Default amount in SICO

  // Actions - State
  setSicBoGame: (game: SicBoGame | null) => void;
  setSicBoPosition: (position: SicBoPosition | null) => void;
  setIsLoading: (loading: boolean) => void;

  // Actions - Roll result
  setLastRollResult: (result: RollResult | null) => void;
  clearLastRollResult: () => void;

  // Actions - Betting
  setBetAmount: (amount: number) => void;
  addPendingBet: (bet: PendingSicBoBet) => void;
  removePendingBet: (index: number) => void;
  clearPendingBets: () => void;

  // Actions - Quick bets
  addSmallBet: (amount?: number) => void;
  addBigBet: (amount?: number) => void;
  addSumBet: (sum: number, amount?: number) => void;
  addSpecificTripleBet: (number: number, amount?: number) => void;
  addAnyTripleBet: (amount?: number) => void;
  addSpecificDoubleBet: (number: number, amount?: number) => void;
  addCombinationBet: (index: number, amount?: number) => void;
  addSingleBet: (number: number, amount?: number) => void;
}

export const useSicBoStore = create<SicBoState>()(
  persist(
    (set) => ({
      // Initial state
      sicboGame: null,
      sicboPosition: null,
      isLoading: false,
      lastRollResult: null,
      pendingBets: [],
      betAmount: 0.01,

      // State setters
      setSicBoGame: (game) => set({ sicboGame: game }),
      setSicBoPosition: (position) => set({ sicboPosition: position }),
      setIsLoading: (loading) => set({ isLoading: loading }),

      // Roll result
      setLastRollResult: (result) => set({ lastRollResult: result }),
      clearLastRollResult: () => set({ lastRollResult: null }),

      // Betting setters
      setBetAmount: (amount) => set({ betAmount: amount }),

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
      addSmallBet: (amount) => {
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: SicBoBetType.Small,
              betIndex: 0,
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      addBigBet: (amount) => {
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: SicBoBetType.Big,
              betIndex: 0,
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      addSumBet: (sum, amount) => {
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: SicBoBetType.Sum,
              betIndex: sum - 4, // index = sum-4 (for sums 4-17)
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      addSpecificTripleBet: (number, amount) => {
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: SicBoBetType.SpecificTriple,
              betIndex: number - 1, // index = dice-1 (for 1-6)
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      addAnyTripleBet: (amount) => {
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: SicBoBetType.AnyTriple,
              betIndex: 0,
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      addSpecificDoubleBet: (number, amount) => {
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: SicBoBetType.SpecificDouble,
              betIndex: number - 1, // index = dice-1 (for 1-6)
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      addCombinationBet: (index, amount) => {
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: SicBoBetType.Combination,
              betIndex: index,
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      addSingleBet: (number, amount) => {
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: SicBoBetType.Single,
              betIndex: number - 1, // index = dice-1 (for 1-6)
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },
    }),
    {
      name: "orecraps-sicbo-store",
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
export const useSicBoGame = () => useSicBoStore((state) => state.sicboGame);
export const useSicBoPosition = () => useSicBoStore((state) => state.sicboPosition);
export const useSicBoPendingBets = () => useSicBoStore((state) => state.pendingBets);
export const useSicBoBetAmount = () => useSicBoStore((state) => state.betAmount);
export const useSicBoIsLoading = () => useSicBoStore((state) => state.isLoading);
export const useLastRollResult = () => useSicBoStore((state) => state.lastRollResult);

// ============================================================================
// DERIVED SELECTORS
// ============================================================================

// Get current epoch ID
export const useCurrentEpochId = () =>
  useSicBoStore((state) => state.sicboGame?.epochId ?? 0n);

// Get house bankroll in SICO
export const useSicBoHouseBankroll = () =>
  useSicBoStore((state) =>
    state.sicboGame
      ? Number(state.sicboGame.houseBankroll) / Number(ONE_SICO)
      : 0
  );

// Get pending winnings in SICO
export const useSicBoPendingWinnings = () =>
  useSicBoStore((state) =>
    state.sicboPosition
      ? Number(state.sicboPosition.pendingWinnings) / Number(ONE_SICO)
      : 0
  );

// Get total pending bet amount
export const useSicBoTotalPendingAmount = () =>
  useSicBoStore((state) =>
    state.pendingBets.reduce((sum, bet) => sum + bet.amount, 0)
  );

// Get count of pending bets
export const useSicBoPendingBetCount = () =>
  useSicBoStore((state) => state.pendingBets.length);

// Stable selector for canPlaceBets
const selectCanPlaceBets = (state: SicBoState): [boolean, string | null] => {
  const game = state.sicboGame;
  if (!game) return [false, "Game not loaded"];
  // Sic Bo is always ready for bets (single-player, no rounds)
  return [true, null];
};

// Check if game is ready for bets
export const useCanPlaceSicBoBets = () => {
  const [canBet, reason] = useSicBoStore(useShallow(selectCanPlaceBets));
  return { canBet, reason };
};

// Get last result string
export const useLastResultString = () =>
  useSicBoStore((state) => {
    const game = state.sicboGame;
    if (!game || !game.lastDice || game.lastDice.every(d => d === 0)) return null;
    return game.lastDice.join(", ");
  });

// ============================================================================
// BET INFO HELPERS
// ============================================================================

// Get bet type name
export function getSicBoBetTypeName(betType: SicBoBetType, betIndex: number): string {
  return getSicBoBetDisplayInfo(betType, betIndex).name;
}

// Format SICO base units to SICO display
export function formatSicoBaseUnits(amount: bigint): string {
  return (Number(amount) / Number(ONE_SICO)).toFixed(4);
}

// Get total active bets for a position
export function getTotalActiveBets(position: SicBoPosition): bigint {
  let total = position.small + position.big + position.anyTriple;

  for (let i = 0; i < 14; i++) {
    total += position.sums[i];
  }

  for (let i = 0; i < 6; i++) {
    total += position.specificTriples[i];
    total += position.specificDoubles[i];
    total += position.singles[i];
  }

  for (let i = 0; i < 15; i++) {
    total += position.combinations[i];
  }

  return total;
}

// Check if position has any active bets
export function hasActiveBets(position: SicBoPosition | null): boolean {
  if (!position) return false;
  return getTotalActiveBets(position) > 0n;
}
