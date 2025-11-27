import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getIndicesForSum } from "@/lib/dice";

export interface RoundResult {
  roundId: number;
  winningSquare: number;
  diceResult: [number, number];
  diceSum: number;
  totalDeployed: number;
  totalWinnings: number;
  timestamp: number;
  userWon: boolean;
  userPrediction: number;
  userReward: number;
}

interface GameState {
  // User preferences
  selectedSum: number | null; // Currently highlighted sum (2-12) or null
  selectedSquares: boolean[]; // 36 squares for all dice combinations
  deployAmount: number; // in SOL

  // UI state
  isDeploying: boolean;
  showDiceAnimation: boolean;
  lastDiceResult: [number, number] | null;

  // History
  roundHistory: RoundResult[];

  // Actions
  setSelectedSum: (sum: number | null) => void;
  selectBySum: (sum: number) => void;
  toggleSquare: (index: number) => void;
  selectAllSquares: () => void;
  clearSquares: () => void;
  setDeployAmount: (amount: number) => void;
  setIsDeploying: (deploying: boolean) => void;
  setShowDiceAnimation: (show: boolean) => void;
  setLastDiceResult: (result: [number, number] | null) => void;
  addRoundResult: (result: RoundResult) => void;
  clearHistory: () => void;
}

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      // Initial state
      selectedSum: null,
      selectedSquares: Array(36).fill(false),
      deployAmount: 0.1,
      isDeploying: false,
      showDiceAnimation: false,
      lastDiceResult: null,
      roundHistory: [],

      // Actions
      setSelectedSum: (sum) => set({ selectedSum: sum }),

      selectBySum: (sum) =>
        set((state) => {
          const indices = getIndicesForSum(sum);
          const newSquares = [...state.selectedSquares];

          // Check if all squares for this sum are already selected
          const allSelected = indices.every((i) => newSquares[i]);

          if (allSelected) {
            // Deselect all squares for this sum
            indices.forEach((i) => {
              newSquares[i] = false;
            });
            return { selectedSquares: newSquares, selectedSum: null };
          } else {
            // Select all squares for this sum (adding to existing selection)
            indices.forEach((i) => {
              newSquares[i] = true;
            });
            return { selectedSquares: newSquares, selectedSum: sum };
          }
        }),

      toggleSquare: (index) =>
        set((state) => {
          const newSquares = [...state.selectedSquares];
          newSquares[index] = !newSquares[index];
          return { selectedSquares: newSquares, selectedSum: null };
        }),

      selectAllSquares: () =>
        set({ selectedSquares: Array(36).fill(true), selectedSum: null }),

      clearSquares: () =>
        set({ selectedSquares: Array(36).fill(false), selectedSum: null }),

      setDeployAmount: (amount) => set({ deployAmount: amount }),

      setIsDeploying: (deploying) => set({ isDeploying: deploying }),

      setShowDiceAnimation: (show) => set({ showDiceAnimation: show }),

      setLastDiceResult: (result) => set({ lastDiceResult: result }),

      addRoundResult: (result) =>
        set((state) => ({
          roundHistory: [result, ...state.roundHistory].slice(0, 50),
        })),

      clearHistory: () => set({ roundHistory: [] }),
    }),
    {
      name: "orecraps-game-store",
      partialize: (state) => ({
        deployAmount: state.deployAmount,
        roundHistory: state.roundHistory,
      }),
    }
  )
);

// FIXED: Use Zustand's built-in memoization instead of manual module-level cache variables

// Derived selector: count of selected squares
// Zustand will memoize this using referential equality on selectedSquares
export const useSelectedSquareCount = () =>
  useGameStore(
    (state) => state.selectedSquares.filter(Boolean).length
  );

// Derived selector: total deploy amount
export const useTotalDeployAmount = () =>
  useGameStore(
    (state) => {
      const count = state.selectedSquares.filter(Boolean).length;
      return count * state.deployAmount;
    }
  );

// Derived selector: win rate percentage
export const useWinRate = () =>
  useGameStore(
    (state) => {
      const { roundHistory } = state;
      if (roundHistory.length === 0) return 0;
      const wins = roundHistory.filter((r) => r.userWon).length;
      return (wins / roundHistory.length) * 100;
    }
  );
