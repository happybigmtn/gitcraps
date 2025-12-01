"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { CrapsBetType, CRAPS_PAYOUTS } from "@/lib/program";
import type { CrapsPosition } from "@/lib/program";
import { getBetTypeName } from "./crapsStore";

// Maximum number of bets to keep in history
const MAX_HISTORY_SIZE = 100;

export interface SettledBet {
  id: string;
  timestamp: number;
  player: string; // Wallet pubkey
  betType: CrapsBetType;
  point: number;
  betAmount: number; // in CRAP
  winAmount: number; // in CRAP (0 if lost, positive if won)
  pnl: number; // profit/loss = winAmount - betAmount
  diceResult: [number, number]; // [die1, die2]
  roundId: string;
  txSignature?: string;
}

interface BetHistoryState {
  // Settled bets history
  bets: SettledBet[];

  // Actions
  addBet: (bet: Omit<SettledBet, "id">) => void;
  clearHistory: () => void;

  // Computed
  getRecentBets: (limit?: number) => SettledBet[];
  getBetsByPlayer: (player: string, limit?: number) => SettledBet[];
  getBetsSortedByPnL: (limit?: number) => SettledBet[];
  getAggregateStats: () => {
    totalBets: number;
    totalWagered: number;
    totalWon: number;
    netPnL: number;
    winRate: number;
    biggestWin: number;
    biggestLoss: number;
  };
}

export const useBetHistoryStore = create<BetHistoryState>()(
  persist(
    (set, get) => ({
      bets: [],

      addBet: (bet) => {
        // Generate secure unique ID
        const randomBytes = new Uint32Array(2);
        crypto.getRandomValues(randomBytes);
        const id = `bet-${Date.now()}-${randomBytes[0].toString(36)}${randomBytes[1].toString(36)}`;

        const newBet: SettledBet = {
          ...bet,
          id,
        };

        set((state) => ({
          bets: [newBet, ...state.bets].slice(0, MAX_HISTORY_SIZE),
        }));
      },

      clearHistory: () => set({ bets: [] }),

      getRecentBets: (limit = 25) => {
        const { bets } = get();
        return bets.slice(0, limit);
      },

      getBetsByPlayer: (player, limit = 25) => {
        const { bets } = get();
        return bets.filter((b) => b.player === player).slice(0, limit);
      },

      getBetsSortedByPnL: (limit = 25) => {
        const { bets } = get();
        return [...bets]
          .sort((a, b) => b.pnl - a.pnl)
          .slice(0, limit);
      },

      getAggregateStats: () => {
        const { bets } = get();

        if (bets.length === 0) {
          return {
            totalBets: 0,
            totalWagered: 0,
            totalWon: 0,
            netPnL: 0,
            winRate: 0,
            biggestWin: 0,
            biggestLoss: 0,
          };
        }

        const totalWagered = bets.reduce((sum, b) => sum + b.betAmount, 0);
        const totalWon = bets.reduce((sum, b) => sum + b.winAmount, 0);
        const netPnL = totalWon - totalWagered;
        const wins = bets.filter((b) => b.pnl > 0);
        const winRate = (wins.length / bets.length) * 100;

        const pnls = bets.map((b) => b.pnl);
        const biggestWin = Math.max(0, ...pnls);
        const biggestLoss = Math.min(0, ...pnls);

        return {
          totalBets: bets.length,
          totalWagered,
          totalWon,
          netPnL,
          winRate,
          biggestWin,
          biggestLoss,
        };
      },
    }),
    {
      name: "orecraps-bet-history",
      partialize: (state) => ({
        bets: state.bets.slice(0, MAX_HISTORY_SIZE),
      }),
    }
  )
);

// Selectors with shallow comparison to prevent infinite re-render loops
// IMPORTANT: These selectors return new arrays/objects, so we use useShallow
// to compare by value rather than reference. Without this, every render would
// see a "new" object and trigger another render, causing the error:
// "The result of getSnapshot should be cached to avoid an infinite loop"
export const useRecentBets = (limit = 25) =>
  useBetHistoryStore(useShallow((state) => state.getRecentBets(limit)));

export const useBetsSortedByPnL = (limit = 25) =>
  useBetHistoryStore(useShallow((state) => state.getBetsSortedByPnL(limit)));

export const useBetHistoryStats = () =>
  useBetHistoryStore(useShallow((state) => state.getAggregateStats()));

const ONE_CRAP_NUM = 1_000_000_000; // 10^9

/**
 * Extract active bets from a CrapsPosition and calculate outcomes based on dice result.
 * Returns an array of bet details to record in history.
 */
export function extractAndCalculateBets(
  position: CrapsPosition,
  diceResult: [number, number],
  player: string,
  roundId: string,
  currentPoint: number,
  txSignature?: string
): Array<Omit<SettledBet, "id">> {
  const bets: Array<Omit<SettledBet, "id">> = [];
  const sum = diceResult[0] + diceResult[1];
  const timestamp = Date.now();

  // Helper to convert bigint to CRAP number
  const toCRAP = (val: bigint): number => Number(val) / ONE_CRAP_NUM;

  // Helper to add a bet if it has a non-zero amount
  const addBet = (
    betType: CrapsBetType,
    point: number,
    amount: bigint,
    isWin: boolean,
    payoutMultiplier: { num: number; den: number }
  ) => {
    if (amount <= 0n) return;
    const betAmount = toCRAP(amount);
    const winAmount = isWin
      ? betAmount + betAmount * (payoutMultiplier.num / payoutMultiplier.den)
      : 0;
    const pnl = winAmount - betAmount;

    bets.push({
      timestamp,
      player,
      betType,
      point,
      betAmount,
      winAmount,
      pnl,
      diceResult,
      roundId,
      txSignature,
    });
  };

  // Pass Line: wins on 7/11 come-out, loses on 2/3/12 come-out, point wins when point is hit
  // IMPORTANT: On come-out, if a point number (4,5,6,8,9,10) is rolled, the bet stays active
  // and should NOT be recorded as a win or loss
  // IMPORTANT: After point is established, bet only resolves on point (win) or 7 (lose)
  if (position.passLine > 0n) {
    const isComeOut = currentPoint === 0;
    const isPointNumber = [4, 5, 6, 8, 9, 10].includes(sum);

    if (isComeOut) {
      // Come-out roll
      if (isPointNumber) {
        // Point established - don't record this bet, it stays active
        // The bet will be recorded when the point is hit or 7-out occurs
      } else {
        // 7/11 wins, 2/3/12 loses - bet resolves
        const isPassWin = sum === 7 || sum === 11;
        addBet(CrapsBetType.PassLine, 0, position.passLine, isPassWin, CRAPS_PAYOUTS.passLine);
      }
    } else {
      // Point is established - bet only resolves on point or 7
      const hitsPoint = sum === currentPoint;
      const sevenOut = sum === 7;
      if (hitsPoint || sevenOut) {
        addBet(CrapsBetType.PassLine, 0, position.passLine, hitsPoint, CRAPS_PAYOUTS.passLine);
      }
      // Any other roll - bet stays active, don't record
    }
  }

  // Don't Pass: wins on 2/3 come-out, pushes on 12, loses on 7/11 come-out, wins on 7 after point set
  // IMPORTANT: On come-out, if a point number (4,5,6,8,9,10) is rolled, the bet stays active
  // IMPORTANT: After point is established, bet only resolves on 7 (win) or point (lose)
  if (position.dontPass > 0n) {
    const isComeOut = currentPoint === 0;
    const isPointNumber = [4, 5, 6, 8, 9, 10].includes(sum);

    if (isComeOut) {
      // Come-out roll
      if (isPointNumber) {
        // Point established - don't record this bet, it stays active
      } else if (sum === 12) {
        // Push - don't record as win/loss, bet is returned
      } else {
        // 2/3 wins, 7/11 loses - bet resolves
        const isDontPassWin = sum === 2 || sum === 3;
        addBet(CrapsBetType.DontPass, 0, position.dontPass, isDontPassWin, CRAPS_PAYOUTS.dontPass);
      }
    } else {
      // Point is established - bet only resolves on 7 (win) or point (lose)
      const sevenOut = sum === 7;
      const hitsPoint = sum === currentPoint;
      if (sevenOut || hitsPoint) {
        addBet(CrapsBetType.DontPass, 0, position.dontPass, sevenOut, CRAPS_PAYOUTS.dontPass);
      }
      // Any other roll - bet stays active, don't record
    }
  }

  // Pass Odds: wins when point is hit, loses on 7
  // IMPORTANT: Only resolves on point (win) or 7 (lose)
  if (position.passOdds > 0n && currentPoint !== 0) {
    const hitsPoint = sum === currentPoint;
    const sevenOut = sum === 7;
    if (hitsPoint || sevenOut) {
      const payout = getOddsPayout(currentPoint);
      addBet(CrapsBetType.PassOdds, currentPoint, position.passOdds, hitsPoint, payout);
    }
    // Any other roll - bet stays active, don't record
  }

  // Don't Pass Odds: wins on 7, loses when point is hit
  // IMPORTANT: Only resolves on 7 (win) or point (lose)
  if (position.dontPassOdds > 0n && currentPoint !== 0) {
    const sevenOut = sum === 7;
    const hitsPoint = sum === currentPoint;
    if (sevenOut || hitsPoint) {
      // Lay odds pay the inverse ratio
      const payout = getLayOddsPayout(currentPoint);
      addBet(CrapsBetType.DontPassOdds, currentPoint, position.dontPassOdds, sevenOut, payout);
    }
    // Any other roll - bet stays active, don't record
  }

  // Field bet: wins on 2,3,4,9,10,11,12 - special payout on 2 and 12
  if (position.fieldBet > 0n) {
    const fieldWins = [2, 3, 4, 9, 10, 11, 12].includes(sum);
    const isSpecial = sum === 2 || sum === 12;
    const payout = isSpecial ? CRAPS_PAYOUTS.field.special : CRAPS_PAYOUTS.field.normal;
    addBet(CrapsBetType.Field, 0, position.fieldBet, fieldWins, payout);
  }

  // Any Seven: wins on 7
  if (position.anySeven > 0n) {
    addBet(CrapsBetType.AnySeven, 0, position.anySeven, sum === 7, CRAPS_PAYOUTS.anySeven);
  }

  // Any Craps: wins on 2, 3, or 12
  if (position.anyCraps > 0n) {
    const isAnyCrapsWin = sum === 2 || sum === 3 || sum === 12;
    addBet(CrapsBetType.AnyCraps, 0, position.anyCraps, isAnyCrapsWin, CRAPS_PAYOUTS.anyCraps);
  }

  // Yo Eleven: wins on 11
  if (position.yoEleven > 0n) {
    addBet(CrapsBetType.YoEleven, 0, position.yoEleven, sum === 11, CRAPS_PAYOUTS.yoEleven);
  }

  // Aces (Snake Eyes): wins on 2
  if (position.aces > 0n) {
    addBet(CrapsBetType.Aces, 0, position.aces, sum === 2, CRAPS_PAYOUTS.aces);
  }

  // Twelve (Boxcars): wins on 12
  if (position.twelve > 0n) {
    addBet(CrapsBetType.Twelve, 0, position.twelve, sum === 12, CRAPS_PAYOUTS.twelve);
  }

  // Come bets: 6 elements for points 4,5,6,8,9,10
  // Come bets on a point win when that point is hit, lose on 7
  // (simplified - real Come bets have two-phase resolution)
  const comePoints = [4, 5, 6, 8, 9, 10];
  position.comeBets.forEach((bet, idx) => {
    if (bet > 0n) {
      const comePoint = comePoints[idx];
      const hitsPoint = sum === comePoint;
      const sevenOut = sum === 7;
      // Only resolve on point hit or 7
      if (hitsPoint || sevenOut) {
        addBet(CrapsBetType.Come, comePoint, bet, hitsPoint, CRAPS_PAYOUTS.passLine);
      }
    }
  });

  // Come Odds: same logic as Come bets but with true odds payout
  position.comeOdds.forEach((bet, idx) => {
    if (bet > 0n) {
      const comePoint = comePoints[idx];
      const hitsPoint = sum === comePoint;
      const sevenOut = sum === 7;
      if (hitsPoint || sevenOut) {
        const payout = getOddsPayout(comePoint);
        addBet(CrapsBetType.ComeOdds, comePoint, bet, hitsPoint, payout);
      }
    }
  });

  // Don't Come bets: win on 7, lose when point is hit
  position.dontComeBets.forEach((bet, idx) => {
    if (bet > 0n) {
      const comePoint = comePoints[idx];
      const hitsPoint = sum === comePoint;
      const sevenOut = sum === 7;
      if (sevenOut || hitsPoint) {
        addBet(CrapsBetType.DontCome, comePoint, bet, sevenOut, CRAPS_PAYOUTS.dontPass);
      }
    }
  });

  // Don't Come Odds: win on 7 with lay odds payout
  position.dontComeOdds.forEach((bet, idx) => {
    if (bet > 0n) {
      const comePoint = comePoints[idx];
      const hitsPoint = sum === comePoint;
      const sevenOut = sum === 7;
      if (sevenOut || hitsPoint) {
        const payout = getLayOddsPayout(comePoint);
        addBet(CrapsBetType.DontComeOdds, comePoint, bet, sevenOut, payout);
      }
    }
  });

  // Place bets: 6 elements for points 4,5,6,8,9,10
  const placePoints = [4, 5, 6, 8, 9, 10];
  position.placeBets.forEach((bet, idx) => {
    if (bet > 0n) {
      const point = placePoints[idx];
      const isPlaceWin = sum === point;
      const payout = getPlacePayout(point);
      addBet(CrapsBetType.Place, point, bet, isPlaceWin, payout);
    }
  });

  // Hardways: 4 elements for 4,6,8,10
  const hardwayPoints = [4, 6, 8, 10];
  position.hardways.forEach((bet, idx) => {
    if (bet > 0n) {
      const point = hardwayPoints[idx];
      const isHard = diceResult[0] === diceResult[1] && diceResult[0] * 2 === point;
      const payout = point === 4 || point === 10 ? CRAPS_PAYOUTS.hard4_10 : CRAPS_PAYOUTS.hard6_8;
      addBet(CrapsBetType.Hardway, point, bet, isHard, payout);
    }
  });

  return bets;
}

// Helper functions for payouts
function getOddsPayout(point: number): { num: number; den: number } {
  switch (point) {
    case 4:
    case 10:
      return CRAPS_PAYOUTS.trueOdds4_10;
    case 5:
    case 9:
      return CRAPS_PAYOUTS.trueOdds5_9;
    case 6:
    case 8:
      return CRAPS_PAYOUTS.trueOdds6_8;
    default:
      return { num: 1, den: 1 };
  }
}

function getLayOddsPayout(point: number): { num: number; den: number } {
  // Lay odds pay the inverse
  switch (point) {
    case 4:
    case 10:
      return { num: 1, den: 2 };
    case 5:
    case 9:
      return { num: 2, den: 3 };
    case 6:
    case 8:
      return { num: 5, den: 6 };
    default:
      return { num: 1, den: 1 };
  }
}

function getPlacePayout(point: number): { num: number; den: number } {
  switch (point) {
    case 4:
    case 10:
      return CRAPS_PAYOUTS.place4_10;
    case 5:
    case 9:
      return CRAPS_PAYOUTS.place5_9;
    case 6:
    case 8:
      return CRAPS_PAYOUTS.place6_8;
    default:
      return { num: 1, den: 1 };
  }
}

// Helper to format bet for display
export function formatBetForDisplay(bet: SettledBet): {
  betName: string;
  diceSum: number;
  isWin: boolean;
  pnlFormatted: string;
  pnlClass: string;
} {
  const betName = getBetTypeName(bet.betType, bet.point);
  const diceSum = bet.diceResult[0] + bet.diceResult[1];
  const isWin = bet.pnl > 0;
  const pnlFormatted = bet.pnl > 0
    ? `+${bet.pnl.toFixed(4)}`
    : bet.pnl.toFixed(4);
  const pnlClass = bet.pnl > 0
    ? "text-green-500"
    : bet.pnl < 0
    ? "text-red-500"
    : "text-muted-foreground";

  return {
    betName,
    diceSum,
    isWin,
    pnlFormatted,
    pnlClass,
  };
}
