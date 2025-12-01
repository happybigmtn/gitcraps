"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useCrapsStore } from "@/store/crapsStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Zap, Target } from "lucide-react";
import { CRAPS_PAYOUTS } from "@/lib/program";

// Ways to roll each sum
const WAYS_TO_ROLL: Record<number, number> = {
  2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1
};

// All sums for betting
const ALL_SUMS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const YES_NO_SUMS = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12]; // Exclude 7

// Get Yes payout string (sum before 7)
function getYesPayout(sum: number): string {
  const payout = CRAPS_PAYOUTS[`yes${sum}` as keyof typeof CRAPS_PAYOUTS] as { num: number; den: number } | undefined;
  if (!payout) return "";
  return payout.den === 1 ? `${payout.num}:1` : `${payout.num}:${payout.den}`;
}

// Get No payout string (7 before sum)
function getNoPayout(sum: number): string {
  const payout = CRAPS_PAYOUTS[`no${sum}` as keyof typeof CRAPS_PAYOUTS] as { num: number; den: number } | undefined;
  if (!payout) return "";
  return payout.den === 1 ? `${payout.num}:1` : `${payout.num}:${payout.den}`;
}

// Get Next payout string (single roll)
function getNextPayout(sum: number): string {
  const payout = CRAPS_PAYOUTS[`next${sum}` as keyof typeof CRAPS_PAYOUTS] as { num: number; den: number } | undefined;
  if (!payout) return "";
  if (payout.den === 1) return `${payout.num}:1`;
  return `${(payout.num / payout.den).toFixed(1)}:1`;
}

interface TrueOddsBetPanelProps {
  className?: string;
}

export function TrueOddsBetPanel({ className }: TrueOddsBetPanelProps) {
  const betAmount = useCrapsStore((state) => state.betAmount);
  const setBetAmount = useCrapsStore((state) => state.setBetAmount);
  const addYesBet = useCrapsStore((state) => state.addYesBet);
  const addNoBet = useCrapsStore((state) => state.addNoBet);
  const addNextBet = useCrapsStore((state) => state.addNextBet);

  const [activeTab, setActiveTab] = useState<string>("yes");

  // Quick bet amount buttons
  const quickAmounts = [0.01, 0.05, 0.1, 0.5, 1];

  return (
    <Card className={cn("overflow-hidden border-border/50", className)}>
      <CardHeader className="pb-2 border-l-3 border-l-green-500">
        <div className="flex items-center justify-between">
          <CardTitle className="font-mono text-sm uppercase tracking-wide flex items-center gap-2">
            <Zap className="h-4 w-4 text-green-500" />
            TRUE ODDS BETS
          </CardTitle>
          <span className="text-[10px] font-mono text-green-500 bg-green-500/10 px-2 py-0.5 rounded">
            0% HOUSE EDGE
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-2">
        {/* Bet amount selector */}
        <div className="space-y-2">
          <label className="text-xs font-mono text-muted-foreground">BET AMOUNT</label>
          <div className="flex gap-2">
            <Input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(parseFloat(e.target.value) || 0)}
              className="font-mono text-sm w-24"
              step="0.01"
              min="0"
            />
            <div className="flex gap-1 flex-wrap">
              {quickAmounts.map((amt) => (
                <Button
                  key={amt}
                  variant={betAmount === amt ? "default" : "outline"}
                  size="sm"
                  className="font-mono text-xs px-2"
                  onClick={() => setBetAmount(amt)}
                >
                  {amt}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs for Yes/No/Next */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-9">
            <TabsTrigger value="yes" className="font-mono text-xs gap-1">
              <TrendingUp className="h-3 w-3" />
              YES
            </TabsTrigger>
            <TabsTrigger value="no" className="font-mono text-xs gap-1">
              <TrendingDown className="h-3 w-3" />
              NO
            </TabsTrigger>
            <TabsTrigger value="next" className="font-mono text-xs gap-1">
              <Target className="h-3 w-3" />
              NEXT
            </TabsTrigger>
          </TabsList>

          {/* Yes bets - sum before 7 */}
          <TabsContent value="yes" className="space-y-3 mt-3">
            <p className="text-[10px] text-muted-foreground font-mono">
              Win if chosen sum rolls before 7. True odds payout!
            </p>
            <div className="grid grid-cols-5 gap-2">
              {YES_NO_SUMS.map((sum) => (
                <motion.button
                  key={sum}
                  onClick={() => addYesBet(sum)}
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    "p-2 rounded border border-green-500/30 bg-green-500/5",
                    "hover:bg-green-500/15 hover:border-green-500/50 transition-all",
                    "flex flex-col items-center"
                  )}
                >
                  <span className="font-bold text-lg text-green-400">{sum}</span>
                  <span className="text-[10px] text-green-500/70 font-mono">{getYesPayout(sum)}</span>
                  <span className="text-[8px] text-muted-foreground font-mono">{WAYS_TO_ROLL[sum]}/36</span>
                </motion.button>
              ))}
            </div>
          </TabsContent>

          {/* No bets - 7 before sum */}
          <TabsContent value="no" className="space-y-3 mt-3">
            <p className="text-[10px] text-muted-foreground font-mono">
              Win if 7 rolls before chosen sum. Inverse true odds!
            </p>
            <div className="grid grid-cols-5 gap-2">
              {YES_NO_SUMS.map((sum) => (
                <motion.button
                  key={sum}
                  onClick={() => addNoBet(sum)}
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    "p-2 rounded border border-red-500/30 bg-red-500/5",
                    "hover:bg-red-500/15 hover:border-red-500/50 transition-all",
                    "flex flex-col items-center"
                  )}
                >
                  <span className="font-bold text-lg text-red-400">{sum}</span>
                  <span className="text-[10px] text-red-500/70 font-mono">{getNoPayout(sum)}</span>
                  <span className="text-[8px] text-muted-foreground font-mono">6/36 vs {WAYS_TO_ROLL[sum]}/36</span>
                </motion.button>
              ))}
            </div>
          </TabsContent>

          {/* Next bets - single roll */}
          <TabsContent value="next" className="space-y-3 mt-3">
            <p className="text-[10px] text-muted-foreground font-mono">
              Single-roll bet on next dice sum. True odds payout!
            </p>
            <div className="grid grid-cols-6 gap-1.5">
              {ALL_SUMS.map((sum) => (
                <motion.button
                  key={sum}
                  onClick={() => addNextBet(sum)}
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    "p-1.5 rounded border border-primary/30 bg-primary/5",
                    "hover:bg-primary/15 hover:border-primary/50 transition-all",
                    "flex flex-col items-center",
                    sum === 7 && "border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/15 hover:border-yellow-500/50"
                  )}
                >
                  <span className={cn(
                    "font-bold text-sm",
                    sum === 7 ? "text-yellow-400" : "text-primary"
                  )}>{sum}</span>
                  <span className={cn(
                    "text-[8px] font-mono",
                    sum === 7 ? "text-yellow-500/70" : "text-primary/70"
                  )}>{getNextPayout(sum)}</span>
                </motion.button>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Info box */}
        <div className="p-2 rounded bg-green-500/5 border border-green-500/20">
          <p className="text-[9px] text-muted-foreground font-mono leading-relaxed">
            <span className="text-green-500 font-bold">TRUE ODDS</span> bets pay out at exact mathematical
            probability with <span className="text-green-500">0% house edge</span>. Unlike casino craps
            which takes a commission (vig), these bets are provably fair.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
