import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  CrapsBetType,
  CrapsGame,
  CrapsPosition,
  pointToIndex,
} from "@/lib/program";
import { ONE_RNG } from "@/lib/solana";

// Roll result for synchronization between mining and craps
export interface RollResult {
  die1: number;
  die2: number;
  sum: number;
  winningSquare: number;
  timestamp: number; // When the roll was generated
}

// Pending bet before it's sent to chain
export interface PendingBet {
  betType: CrapsBetType;
  point: number; // 0 for bets that don't need a point
  amount: number; // in RNG
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

  // Roll synchronization (shared between mining roll and craps settlement)
  lastRollResult: RollResult | null;

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

  // Actions - Roll synchronization
  setLastRollResult: (result: RollResult | null) => void;
  clearLastRollResult: () => void;

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
  addComeBet: (point: number, amount?: number) => void;
  addDontComeBet: (point: number, amount?: number) => void;
  addComeOddsBet: (point: number, amount?: number) => void;
  addDontComeOddsBet: (point: number, amount?: number) => void;
  addFieldBet: (amount?: number) => void;
  addAnySevenBet: (amount?: number) => void;
  addPlaceBet: (point: number, amount?: number) => void;
  addHardwayBet: (hardway: number, amount?: number) => void;
  // True odds bets (0% house edge)
  addYesBet: (sum: number, amount?: number) => void;
  addNoBet: (sum: number, amount?: number) => void;
  addNextBet: (sum: number, amount?: number) => void;
}

export const useCrapsStore = create<CrapsState>()(
  persist(
    (set) => ({
      // Initial state
      crapsGame: null,
      crapsPosition: null,
      isLoading: false,
      lastRollResult: null,
      pendingBets: [],
      betAmount: 0.01,
      selectedBetType: null,
      selectedPoint: null,

      // State setters
      setCrapsGame: (game) => set({ crapsGame: game }),
      setCrapsPosition: (position) => set({ crapsPosition: position }),
      setIsLoading: (loading) => set({ isLoading: loading }),

      // Roll synchronization
      setLastRollResult: (result) => set({ lastRollResult: result }),
      clearLastRollResult: () => set({ lastRollResult: null }),

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

      // Come bets - require a point number
      // Note: Current on-chain implementation places bets directly on a point
      // (simplified from true Come bet two-phase resolution)
      addComeBet: (point, amount) => {
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: CrapsBetType.Come,
              point,
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      addDontComeBet: (point, amount) => {
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: CrapsBetType.DontCome,
              point,
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      addComeOddsBet: (point, amount) => {
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: CrapsBetType.ComeOdds,
              point,
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      addDontComeOddsBet: (point, amount) => {
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: CrapsBetType.DontComeOdds,
              point,
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      addFieldBet: (amount) => {
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

      // True odds bets (0% house edge)
      // Yes bet - sum before 7 (on-chain uses Buy type)
      addYesBet: (sum, amount) => {
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: CrapsBetType.Buy, // On-chain Buy = Yes
              point: sum, // Sum 2-12 (except 7)
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      // No bet - 7 before sum (on-chain uses Lay type)
      addNoBet: (sum, amount) => {
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: CrapsBetType.Lay, // On-chain Lay = No
              point: sum, // Sum 2-12 (except 7)
              amount: amount ?? s.betAmount,
            },
          ],
        }));
      },

      // Next bet - single roll (on-chain uses Hop type)
      addNextBet: (sum, amount) => {
        set((s) => ({
          pendingBets: [
            ...s.pendingBets,
            {
              betType: CrapsBetType.Hop, // On-chain Hop = Next
              point: sum, // Sum 2-12
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
// BASIC STATE SELECTORS
// ============================================================================
// Use these selectors to subscribe to specific state slices and prevent
// unnecessary re-renders from over-subscription

// Core state selectors
export const useCrapsGame = () => useCrapsStore((state) => state.crapsGame);
export const useCrapsPosition = () => useCrapsStore((state) => state.crapsPosition);
export const usePendingBets = () => useCrapsStore((state) => state.pendingBets);
export const useBetAmount = () => useCrapsStore((state) => state.betAmount);
export const useSelectedBetType = () => useCrapsStore((state) => state.selectedBetType);
export const useSelectedPoint = () => useCrapsStore((state) => state.selectedPoint);
export const useIsLoading = () => useCrapsStore((state) => state.isLoading);
export const useLastRollResult = () => useCrapsStore((state) => state.lastRollResult);

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

// Get house bankroll in RNG
export const useHouseBankroll = () =>
  useCrapsStore((state) =>
    state.crapsGame
      ? Number(state.crapsGame.houseBankroll) / Number(ONE_RNG)
      : 0
  );

// Get pending winnings in RNG
export const usePendingWinnings = () =>
  useCrapsStore((state) =>
    state.crapsPosition
      ? Number(state.crapsPosition.pendingWinnings) / Number(ONE_RNG)
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

      // True odds bets (0% house edge)
      case CrapsBetType.Buy:
        if (!point || ![4, 5, 6, 8, 9, 10].includes(point))
          return { canBet: false, reason: "Need valid point (4,5,6,8,9,10)" };
        return { canBet: true };

      case CrapsBetType.Lay:
        if (!point || ![4, 5, 6, 8, 9, 10].includes(point))
          return { canBet: false, reason: "Need valid point (4,5,6,8,9,10)" };
        return { canBet: true };

      case CrapsBetType.Hop:
        if (!point || point < 2 || point > 12)
          return { canBet: false, reason: "Need valid sum (2-12)" };
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

    // Bonus Craps
    case CrapsBetType.BonusSmall:
      return {
        name: "Bonus Small",
        payout: "34:1",
        description: "Win if 2,3,4,5,6 all hit before 7.",
        houseEdge: "7.76%",
        canBet: true,
      };

    case CrapsBetType.BonusTall:
      return {
        name: "Bonus Tall",
        payout: "34:1",
        description: "Win if 8,9,10,11,12 all hit before 7.",
        houseEdge: "7.76%",
        canBet: true,
      };

    case CrapsBetType.BonusAll:
      return {
        name: "Bonus All",
        payout: "176:1",
        description: "Win if all 2-6 and 8-12 hit before 7.",
        houseEdge: "7.76%",
        canBet: true,
      };

    // Come-out only side bets
    case CrapsBetType.FireBet:
      return {
        name: "Fire Bet",
        payout: "4pts:24, 5pts:249, 6pts:999",
        description: "Win based on unique points made. Come-out only.",
        houseEdge: "~20%",
        canBet: true,
      };

    case CrapsBetType.DiffDoubles:
      return {
        name: "Different Doubles",
        payout: "3:4, 4:8, 5:15, 6:100",
        description: "Win when unique doubles rolled before 7. Come-out only.",
        houseEdge: "~18%",
        canBet: true,
      };

    case CrapsBetType.RideTheLine:
      return {
        name: "Ride the Line",
        payout: "3-11+ wins: 1-500:1",
        description: "Win based on pass line wins before seven-out. Come-out only.",
        houseEdge: "~15%",
        canBet: true,
      };

    case CrapsBetType.MugsyCorner:
      return {
        name: "Mugsy's Corner",
        payout: "Comeout 7:2:1, Point 7:3:1",
        description: "Win when 7 is rolled. Come-out only.",
        houseEdge: "~11%",
        canBet: true,
      };

    case CrapsBetType.HotHand:
      return {
        name: "Hot Hand",
        payout: "9 totals:20:1, 10:80:1",
        description: "Hit all totals (2-6, 8-12) before 7. Come-out only.",
        houseEdge: "~19%",
        canBet: true,
      };

    case CrapsBetType.ReplayBet:
      return {
        name: "Replay Bet",
        payout: "3x:8:1, 4x:80:1+",
        description: "Win when same point made 3+ times. Come-out only.",
        houseEdge: "~16%",
        canBet: true,
      };

    case CrapsBetType.FieldersChoice:
      return {
        name: point === 0 ? "Fielder's (2,3,4)" : point === 1 ? "Fielder's (4,9,10)" : "Fielder's (10,11,12)",
        payout: point === 1 ? "2:1" : "4:1",
        description: "Single-roll: win on specific totals. Come-out only.",
        houseEdge: "~14%",
        canBet: true,
      };

    // True odds bets (0% house edge)
    case CrapsBetType.Buy:
      const buyPayout = point
        ? point === 4 || point === 10
          ? "2:1"
          : point === 5 || point === 9
          ? "3:2"
          : "6:5"
        : "varies";
      return {
        name: `Buy (Yes) ${point || ""}`,
        payout: buyPayout,
        description: `Win if ${point || "point"} rolls before 7. TRUE ODDS - 0% house edge!`,
        houseEdge: "0%",
        canBet: true,
      };

    case CrapsBetType.Lay:
      const layPayout = point
        ? point === 4 || point === 10
          ? "1:2"
          : point === 5 || point === 9
          ? "2:3"
          : "5:6"
        : "varies";
      return {
        name: `Lay (No) ${point || ""}`,
        payout: layPayout,
        description: `Win if 7 rolls before ${point || "point"}. TRUE ODDS - 0% house edge!`,
        houseEdge: "0%",
        canBet: true,
      };

    case CrapsBetType.Hop:
      const hopPayouts: { [key: number]: string } = {
        2: "35:1", 3: "17:1", 4: "11:1", 5: "8:1", 6: "6.2:1",
        7: "5:1", 8: "6.2:1", 9: "8:1", 10: "11:1", 11: "17:1", 12: "35:1"
      };
      return {
        name: `Hop (Next) ${point || ""}`,
        payout: point ? hopPayouts[point] || "?" : "varies",
        description: `Single-roll: win if next roll is ${point || "target sum"}. TRUE ODDS - 0% house edge!`,
        houseEdge: "0%",
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

// Format RNG base units to RNG display
export function formatRngBaseUnits(amount: bigint): string {
  // Convert BigInt to Number for display purposes only
  // Division by ONE_RNG (1e9) makes the number small enough to avoid precision issues
  return (Number(amount) / Number(ONE_RNG)).toFixed(4);
}
