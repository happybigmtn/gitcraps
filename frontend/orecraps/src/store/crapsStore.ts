import { create } from "zustand";
import { persist } from "zustand/middleware";
import { shallow } from "zustand/shallow";
import {
  CrapsBetType,
  CrapsGame,
  CrapsPosition,
  POINT_NUMBERS,
  HARDWAY_NUMBERS,
  NUM_POINTS,
  NUM_HARDWAYS,
  CRAPS_PAYOUTS,
  pointToIndex,
  indexToPoint,
} from "@/lib/program";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

// Pending bet before it's sent to chain
export interface PendingBet {
  betType: CrapsBetType;
  point: number; // 0 for bets that don't need a point
  amount: number; // in SOL
}

// Bet display info
export interface BetDisplayInfo {
  name: string;
  payout: string;
  description: string;
  houseEdge: string;
  canBet: boolean;
  reason?: string;
}

interface CrapsState {
  // On-chain state (fetched from RPC)
  crapsGame: CrapsGame | null;
  crapsPosition: CrapsPosition | null;
  isLoading: boolean;

  // Pending bets (not yet on chain)
  pendingBets: PendingBet[];
  betAmount: number; // Default amount in SOL

  // UI state
  selectedBetType: CrapsBetType | null;
  selectedPoint: number | null;

  // Actions - State
  setCrapsGame: (game: CrapsGame | null) => void;
  setCrapsPosition: (position: CrapsPosition | null) => void;
  setIsLoading: (loading: boolean) => void;

  // Actions - Betting
  setBetAmount: (amount: number) => void;
  setSelectedBetType: (betType: CrapsBetType | null) => void;
  setSelectedPoint: (point: number | null) => void;
  addPendingBet: (bet: PendingBet) => void;
  removePendingBet: (index: number) => void;
  clearPendingBets: () => void;

  // Actions - Quick bets
  addPassLineBet: (amount?: number) => void;
  addDontPassBet: (amount?: number) => void;
  addFieldBet: (amount?: number) => void;
  addAnySevenBet: (amount?: number) => void;
  addPlaceBet: (point: number, amount?: number) => void;
  addHardwayBet: (hardway: number, amount?: number) => void;
}

export const useCrapsStore = create<CrapsState>()(
  persist(
    (set, get) => ({
      // Initial state
      crapsGame: null,
      crapsPosition: null,
      isLoading: false,
      pendingBets: [],
      betAmount: 0.01,
      selectedBetType: null,
      selectedPoint: null,

      // State setters
      setCrapsGame: (game) => set({ crapsGame: game }),
      setCrapsPosition: (position) => set({ crapsPosition: position }),
      setIsLoading: (loading) => set({ isLoading: loading }),

      // Betting setters
      setBetAmount: (amount) => set({ betAmount: amount }),
      setSelectedBetType: (betType) => set({ selectedBetType: betType }),
      setSelectedPoint: (point) => set({ selectedPoint: point }),

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
      addPassLineBet: (amount) => {
        const state = get();
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: CrapsBetType.PassLine,
              point: 0,
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      addDontPassBet: (amount) => {
        const state = get();
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: CrapsBetType.DontPass,
              point: 0,
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      addFieldBet: (amount) => {
        const state = get();
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: CrapsBetType.Field,
              point: 0,
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      addAnySevenBet: (amount) => {
        const state = get();
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: CrapsBetType.AnySeven,
              point: 0,
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      addPlaceBet: (point, amount) => {
        const state = get();
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: CrapsBetType.Place,
              point,
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      addHardwayBet: (hardway, amount) => {
        const state = get();
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: CrapsBetType.Hardway,
              point: hardway,
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },
    }),
    {
      name: "orecraps-craps-store",
      partialize: (state) => ({
        betAmount: state.betAmount,
      }),
    }
  )
);

// ============================================================================
// DERIVED SELECTORS
// ============================================================================

// Get current game phase
export const useGamePhase = () =>
  useCrapsStore((state) => {
    if (!state.crapsGame) return "unknown";
    return state.crapsGame.isComeOut ? "come-out" : "point";
  });

// Get current point
export const useCurrentPoint = () =>
  useCrapsStore((state) => state.crapsGame?.point ?? 0);

// Get current epoch
export const useCurrentEpoch = () =>
  useCrapsStore((state) => state.crapsGame?.epochId ?? 0n);

// Get house bankroll in SOL
export const useHouseBankroll = () =>
  useCrapsStore((state) =>
    state.crapsGame
      ? Number(state.crapsGame.houseBankroll) / LAMPORTS_PER_SOL
      : 0
  );

// Get pending winnings in SOL
export const usePendingWinnings = () =>
  useCrapsStore((state) =>
    state.crapsPosition
      ? Number(state.crapsPosition.pendingWinnings) / LAMPORTS_PER_SOL
      : 0
  );

// Get total pending bet amount
export const useTotalPendingAmount = () =>
  useCrapsStore((state) =>
    state.pendingBets.reduce((sum, bet) => sum + bet.amount, 0)
  );

// Get count of pending bets
export const usePendingBetCount = () =>
  useCrapsStore((state) => state.pendingBets.length);

// Check if a bet type can be placed given current game state
export const useCanPlaceBet = (betType: CrapsBetType, point?: number) =>
  useCrapsStore((state) => {
    const game = state.crapsGame;
    const position = state.crapsPosition;

    if (!game) return { canBet: false, reason: "Game not loaded" };

    const isComeOut = game.isComeOut;
    const hasPoint = game.point !== 0;

    switch (betType) {
      case CrapsBetType.PassLine:
        return isComeOut
          ? { canBet: true }
          : { canBet: false, reason: "Only during come-out" };

      case CrapsBetType.DontPass:
        return isComeOut
          ? { canBet: true }
          : { canBet: false, reason: "Only during come-out" };

      case CrapsBetType.PassOdds:
        if (!hasPoint) return { canBet: false, reason: "No point established" };
        if (!position || position.passLine === 0n)
          return { canBet: false, reason: "Need Pass Line bet first" };
        return { canBet: true };

      case CrapsBetType.DontPassOdds:
        if (!hasPoint) return { canBet: false, reason: "No point established" };
        if (!position || position.dontPass === 0n)
          return { canBet: false, reason: "Need Don't Pass bet first" };
        return { canBet: true };

      case CrapsBetType.Come:
      case CrapsBetType.DontCome:
        return { canBet: true };

      case CrapsBetType.ComeOdds:
        if (!point) return { canBet: false, reason: "Need to specify point" };
        if (!position) return { canBet: false, reason: "No position" };
        const comeIdx = pointToIndex(point);
        if (comeIdx === null) return { canBet: false, reason: "Invalid point" };
        if (position.comeBets[comeIdx] === 0n)
          return { canBet: false, reason: "Need Come bet on this point" };
        return { canBet: true };

      case CrapsBetType.DontComeOdds:
        if (!point) return { canBet: false, reason: "Need to specify point" };
        if (!position) return { canBet: false, reason: "No position" };
        const dcIdx = pointToIndex(point);
        if (dcIdx === null) return { canBet: false, reason: "Invalid point" };
        if (position.dontComeBets[dcIdx] === 0n)
          return { canBet: false, reason: "Need Don't Come bet on this point" };
        return { canBet: true };

      case CrapsBetType.Place:
      case CrapsBetType.Hardway:
      case CrapsBetType.Field:
      case CrapsBetType.AnySeven:
      case CrapsBetType.AnyCraps:
      case CrapsBetType.YoEleven:
      case CrapsBetType.Aces:
      case CrapsBetType.Twelve:
        return { canBet: true };

      default:
        return { canBet: false, reason: "Unknown bet type" };
    }
  });

// ============================================================================
// BET INFO HELPERS
// ============================================================================

export function getBetDisplayInfo(betType: CrapsBetType, point?: number): BetDisplayInfo {
  switch (betType) {
    case CrapsBetType.PassLine:
      return {
        name: "Pass Line",
        payout: "1:1",
        description: "Win on 7/11, lose on 2/3/12 (come-out). Then win if point hits before 7.",
        houseEdge: "1.41%",
        canBet: true,
      };

    case CrapsBetType.DontPass:
      return {
        name: "Don't Pass",
        payout: "1:1",
        description: "Win on 2/3, push on 12, lose on 7/11 (come-out). Then win if 7 before point.",
        houseEdge: "1.36%",
        canBet: true,
      };

    case CrapsBetType.PassOdds:
      return {
        name: "Pass Odds",
        payout: "2:1 (4/10), 3:2 (5/9), 6:5 (6/8)",
        description: "True odds bet behind Pass Line. No house edge!",
        houseEdge: "0%",
        canBet: true,
      };

    case CrapsBetType.DontPassOdds:
      return {
        name: "Don't Pass Odds",
        payout: "1:2 (4/10), 2:3 (5/9), 5:6 (6/8)",
        description: "Lay odds against point. No house edge!",
        houseEdge: "0%",
        canBet: true,
      };

    case CrapsBetType.Come:
      return {
        name: "Come",
        payout: "1:1",
        description: "Like Pass Line, but placed after come-out.",
        houseEdge: "1.41%",
        canBet: true,
      };

    case CrapsBetType.DontCome:
      return {
        name: "Don't Come",
        payout: "1:1",
        description: "Like Don't Pass, but placed after come-out.",
        houseEdge: "1.36%",
        canBet: true,
      };

    case CrapsBetType.Place:
      const placePayout = point
        ? point === 4 || point === 10
          ? "9:5"
          : point === 5 || point === 9
          ? "7:5"
          : "7:6"
        : "varies";
      return {
        name: `Place ${point || ""}`,
        payout: placePayout,
        description: `Win if ${point || "number"} rolls before 7.`,
        houseEdge: point === 6 || point === 8 ? "1.52%" : point === 5 || point === 9 ? "4%" : "6.67%",
        canBet: true,
      };

    case CrapsBetType.Hardway:
      const hardPayout = point === 4 || point === 10 ? "7:1" : "9:1";
      return {
        name: `Hard ${point || ""}`,
        payout: hardPayout,
        description: `Win if ${point || "number"} is rolled the hard way (doubles) before 7 or easy way.`,
        houseEdge: point === 4 || point === 10 ? "11.11%" : "9.09%",
        canBet: true,
      };

    case CrapsBetType.Field:
      return {
        name: "Field",
        payout: "1:1 (2x on 2/12)",
        description: "Single-roll: win on 2, 3, 4, 9, 10, 11, 12.",
        houseEdge: "5.56%",
        canBet: true,
      };

    case CrapsBetType.AnySeven:
      return {
        name: "Any Seven",
        payout: "4:1",
        description: "Single-roll: win on any 7.",
        houseEdge: "16.67%",
        canBet: true,
      };

    case CrapsBetType.AnyCraps:
      return {
        name: "Any Craps",
        payout: "7:1",
        description: "Single-roll: win on 2, 3, or 12.",
        houseEdge: "11.11%",
        canBet: true,
      };

    case CrapsBetType.YoEleven:
      return {
        name: "Yo (11)",
        payout: "15:1",
        description: "Single-roll: win on 11.",
        houseEdge: "11.11%",
        canBet: true,
      };

    case CrapsBetType.Aces:
      return {
        name: "Aces (2)",
        payout: "30:1",
        description: "Single-roll: win on 2 (snake eyes).",
        houseEdge: "13.89%",
        canBet: true,
      };

    case CrapsBetType.Twelve:
      return {
        name: "Twelve",
        payout: "30:1",
        description: "Single-roll: win on 12 (boxcars).",
        houseEdge: "13.89%",
        canBet: true,
      };

    default:
      return {
        name: "Unknown",
        payout: "?",
        description: "Unknown bet type",
        houseEdge: "?",
        canBet: false,
      };
  }
}

// Get bet type name
export function getBetTypeName(betType: CrapsBetType, point?: number): string {
  const info = getBetDisplayInfo(betType, point);
  return info.name;
}

// Format lamports to SOL display
export function formatLamports(lamports: bigint): string {
  return (Number(lamports) / LAMPORTS_PER_SOL).toFixed(4);
}
