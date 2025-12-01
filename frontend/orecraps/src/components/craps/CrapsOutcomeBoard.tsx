"use client";

import React, { useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useCrapsStore, useCrapsGame, useGamePhase, useCurrentPoint } from "@/store/crapsStore";
import {
  ALL_DICE_COMBINATIONS,
  DICE_MULTIPLIERS,
  diceToSquare,
} from "@/lib/dice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Grid3X3, Target, Info } from "lucide-react";
import { CrapsBetType, CRAPS_PAYOUTS } from "@/lib/program";

// Mini dice component for headers
function MiniDice({ value, size = 16 }: { value: number; size?: number }) {
  const dots: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };

  return (
    <div
      className="grid grid-cols-3 gap-[1px] bg-foreground rounded-[2px] p-[2px]"
      style={{ width: size, height: size }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <div
          key={i}
          className={cn(
            "rounded-full",
            dots[value]?.includes(i)
              ? "bg-background"
              : "bg-transparent"
          )}
          style={{
            width: size / 4.5,
            height: size / 4.5,
          }}
        />
      ))}
    </div>
  );
}

// Calculate outcome type for a given dice sum based on game state
type OutcomeType = "win" | "lose" | "push" | "point" | "neutral";

interface SquareOutcome {
  type: OutcomeType;
  description: string;
  hopPayout: { num: number; den: number };
  probability: number; // out of 36
}

function getSquareOutcome(
  sum: number,
  isComeOut: boolean,
  currentPoint: number,
  hasPassLine: boolean,
  hasDontPass: boolean
): SquareOutcome {
  const probability = DICE_MULTIPLIERS.find(m => m.sum === sum)?.ways || 0;
  const hopPayout = getNextPayoutForSum(sum);

  // Come-out roll rules
  if (isComeOut) {
    if (sum === 7 || sum === 11) {
      if (hasPassLine) {
        return { type: "win", description: "Natural - Pass wins!", hopPayout, probability };
      } else if (hasDontPass) {
        return { type: "lose", description: "Natural - Don't Pass loses", hopPayout, probability };
      }
      return { type: "neutral", description: "Natural (7 or 11)", hopPayout, probability };
    }
    if (sum === 2 || sum === 3) {
      if (hasPassLine) {
        return { type: "lose", description: "Craps - Pass loses", hopPayout, probability };
      } else if (hasDontPass) {
        return { type: "win", description: "Craps - Don't Pass wins!", hopPayout, probability };
      }
      return { type: "neutral", description: "Craps (2 or 3)", hopPayout, probability };
    }
    if (sum === 12) {
      if (hasPassLine) {
        return { type: "lose", description: "Craps - Pass loses", hopPayout, probability };
      } else if (hasDontPass) {
        return { type: "push", description: "Bar 12 - Push", hopPayout, probability };
      }
      return { type: "neutral", description: "Craps (12 - Bar)", hopPayout, probability };
    }
    // Point established
    return { type: "point", description: `Point ${sum} established`, hopPayout, probability };
  }

  // Point phase rules
  if (sum === currentPoint) {
    if (hasPassLine) {
      return { type: "win", description: `Point ${currentPoint} hit - Pass wins!`, hopPayout, probability };
    } else if (hasDontPass) {
      return { type: "lose", description: `Point ${currentPoint} hit - Don't Pass loses`, hopPayout, probability };
    }
    return { type: "win", description: `Point ${currentPoint} hit!`, hopPayout, probability };
  }
  if (sum === 7) {
    if (hasPassLine) {
      return { type: "lose", description: "Seven out - Pass loses", hopPayout, probability };
    } else if (hasDontPass) {
      return { type: "win", description: "Seven out - Don't Pass wins!", hopPayout, probability };
    }
    return { type: "lose", description: "Seven out", hopPayout, probability };
  }

  return { type: "neutral", description: `Roll ${sum}`, hopPayout, probability };
}

function getNextPayoutForSum(sum: number): { num: number; den: number } {
  switch (sum) {
    case 2: return CRAPS_PAYOUTS.next2;
    case 3: return CRAPS_PAYOUTS.next3;
    case 4: return CRAPS_PAYOUTS.next4;
    case 5: return CRAPS_PAYOUTS.next5;
    case 6: return CRAPS_PAYOUTS.next6;
    case 7: return CRAPS_PAYOUTS.next7;
    case 8: return CRAPS_PAYOUTS.next8;
    case 9: return CRAPS_PAYOUTS.next9;
    case 10: return CRAPS_PAYOUTS.next10;
    case 11: return CRAPS_PAYOUTS.next11;
    case 12: return CRAPS_PAYOUTS.next12;
    default: return { num: 0, den: 1 };
  }
}

function formatPayout(payout: { num: number; den: number }): string {
  if (payout.den === 1) return `${payout.num}:1`;
  if (payout.num % payout.den === 0) return `${payout.num / payout.den}:1`;
  return `${payout.num}:${payout.den}`;
}

interface CrapsOutcomeBoardProps {
  showHopBets?: boolean;
  onSquareClick?: (sum: number) => void;
  className?: string;
}

export function CrapsOutcomeBoard({
  showHopBets = true,
  onSquareClick,
  className,
}: CrapsOutcomeBoardProps) {
  const crapsGame = useCrapsGame();
  const gamePhase = useGamePhase();
  const currentPoint = useCurrentPoint();
  const crapsPosition = useCrapsStore((state) => state.crapsPosition);
  const pendingBets = useCrapsStore((state) => state.pendingBets);
  const addNextBet = useCrapsStore((state) => state.addNextBet);

  const isComeOut = gamePhase === "come-out";
  const hasPassLine = crapsPosition ? crapsPosition.passLine > 0n : false;
  const hasDontPass = crapsPosition ? crapsPosition.dontPass > 0n : false;

  // Check if there's a pending Next bet for a sum
  const hasPendingNextBet = useCallback((sum: number) => {
    return pendingBets.some(
      (bet) => bet.betType === CrapsBetType.Hop && bet.point === sum
    );
  }, [pendingBets]);

  // Calculate outcomes for all squares
  const outcomes = useMemo(() => {
    const result: Map<number, SquareOutcome> = new Map();
    for (let sum = 2; sum <= 12; sum++) {
      result.set(sum, getSquareOutcome(sum, isComeOut, currentPoint, hasPassLine, hasDontPass));
    }
    return result;
  }, [isComeOut, currentPoint, hasPassLine, hasDontPass]);

  // Calculate expected value (always 1.0 for true odds Hop bets)
  const expectedValue = useMemo(() => {
    // True odds Hop bets have 0% house edge, so EV = 1.0
    // EV = sum(probability * (1 + payout))
    let ev = 0;
    for (let sum = 2; sum <= 12; sum++) {
      const outcome = outcomes.get(sum)!;
      const prob = outcome.probability / 36;
      const payout = outcome.hopPayout.num / outcome.hopPayout.den;
      ev += prob * (1 + payout);
    }
    return ev;
  }, [outcomes]);

  const handleSquareClick = useCallback((sum: number) => {
    if (onSquareClick) {
      onSquareClick(sum);
    } else if (showHopBets) {
      addNextBet(sum);
    }
  }, [onSquareClick, showHopBets, addNextBet]);

  // Get color class based on outcome type
  const getOutcomeColorClass = (type: OutcomeType) => {
    switch (type) {
      case "win":
        return "bg-green-500/20 border-green-500/50 text-green-400";
      case "lose":
        return "bg-red-500/20 border-red-500/50 text-red-400";
      case "push":
        return "bg-yellow-500/20 border-yellow-500/50 text-yellow-400";
      case "point":
        return "bg-blue-500/20 border-blue-500/50 text-blue-400";
      default:
        return "bg-secondary/30 border-border/40 text-muted-foreground";
    }
  };

  return (
    <Card className={cn("overflow-hidden border-border/50", className)}>
      <CardHeader className="pb-2 border-l-3 border-l-primary">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="font-mono text-sm uppercase tracking-wide flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              OUTCOME MATRIX
            </CardTitle>
            <span className="text-[10px] font-mono text-muted-foreground">
              {isComeOut ? "COME-OUT" : `POINT: ${currentPoint}`}
            </span>
          </div>
          {showHopBets && (
            <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
              <Info className="h-3 w-3" />
              Click to Hop bet
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* Legend */}
        <div className="flex flex-wrap gap-2 text-[10px] font-mono">
          <span className="px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">WIN</span>
          <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">LOSE</span>
          <span className="px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">PUSH</span>
          <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">POINT</span>
          <span className="px-1.5 py-0.5 rounded bg-secondary/50 text-muted-foreground">NEUTRAL</span>
        </div>

        {/* 6x6 Grid */}
        <div className="overflow-x-auto -mx-3 px-3">
          <div className="min-w-[320px] max-w-[380px] mx-auto">
            {/* Column headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              <div className="aspect-square max-w-[44px] flex items-center justify-center">
                <span className="font-mono text-[9px] text-muted-foreground/50">D2</span>
              </div>
              {[1, 2, 3, 4, 5, 6].map((d2) => (
                <div
                  key={d2}
                  className="aspect-square max-w-[44px] flex items-center justify-center"
                >
                  <MiniDice value={d2} size={14} />
                </div>
              ))}
            </div>

            {/* Grid rows */}
            {[1, 2, 3, 4, 5, 6].map((die1, rowIdx) => (
              <div key={die1} className="grid grid-cols-7 gap-1 mb-1">
                {/* Row label */}
                <div className="aspect-square max-w-[44px] flex items-center justify-center relative">
                  {rowIdx === 0 && (
                    <span className="absolute -left-3 font-mono text-[9px] text-muted-foreground/50 rotate-[-90deg]">
                      D1
                    </span>
                  )}
                  <MiniDice value={die1} size={14} />
                </div>

                {[1, 2, 3, 4, 5, 6].map((die2) => {
                  const index = diceToSquare(die1, die2);
                  const combo = ALL_DICE_COMBINATIONS[index];
                  const outcome = outcomes.get(combo.sum)!;
                  const hasHopBet = hasPendingNextBet(combo.sum);

                  return (
                    <motion.button
                      key={index}
                      onClick={() => handleSquareClick(combo.sum)}
                      className={cn(
                        "relative aspect-square max-w-[44px] rounded snappy",
                        "flex flex-col items-center justify-center",
                        "font-mono text-xs border transition-all",
                        getOutcomeColorClass(outcome.type),
                        hasHopBet && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                        "hover:brightness-110 hover:scale-105"
                      )}
                      whileTap={{ scale: 0.92 }}
                    >
                      <span className="font-bold text-sm tabular-nums">
                        {combo.label}
                      </span>
                      <span className="text-[8px] tabular-nums opacity-70">
                        {formatPayout(outcome.hopPayout)}
                      </span>

                      {/* Hop bet indicator */}
                      {hasHopBet && (
                        <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </motion.button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Hop bet payouts reference */}
        <div className="pt-3 border-t border-border/30">
          <div className="text-[9px] font-mono text-muted-foreground/70 mb-2">
            HOP BET PAYOUTS (TRUE ODDS - 0% HOUSE EDGE):
          </div>
          <div className="grid grid-cols-6 gap-1 text-[9px] font-mono">
            {[
              { sum: 2, payout: "35:1", ways: 1 },
              { sum: 3, payout: "17:1", ways: 2 },
              { sum: 4, payout: "11:1", ways: 3 },
              { sum: 5, payout: "8:1", ways: 4 },
              { sum: 6, payout: "6.2:1", ways: 5 },
              { sum: 7, payout: "5:1", ways: 6 },
              { sum: 8, payout: "6.2:1", ways: 5 },
              { sum: 9, payout: "8:1", ways: 4 },
              { sum: 10, payout: "11:1", ways: 3 },
              { sum: 11, payout: "17:1", ways: 2 },
              { sum: 12, payout: "35:1", ways: 1 },
            ].map((info) => (
              <div
                key={info.sum}
                className="text-center p-1 rounded bg-secondary/30"
              >
                <div className="font-bold text-foreground">{info.sum}</div>
                <div className="text-primary">{info.payout}</div>
                <div className="text-muted-foreground/50">{info.ways}/36</div>
              </div>
            ))}
          </div>
          <p className="text-[8px] text-muted-foreground/40 font-mono mt-2 text-center">
            EV = {expectedValue.toFixed(4)} (provably fair - true odds)
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
