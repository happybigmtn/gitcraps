"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSicBoStore, useLastRollResult } from "@/store/sicboStore";
import { useSicBo } from "@/hooks/useSicBo";
import { Dice3 } from "lucide-react";

export function SicBoTable() {
  const { game, loading } = useSicBo();
  const lastRoll = useLastRollResult();
  const { betAmount, addSmallBet, addBigBet, addSumBet, addSingleBet } = useSicBoStore();

  if (!game) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Dice3 className="h-5 w-5" />
            Sic Bo Table
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Dice3 className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {loading ? "Loading..." : "Sic Bo not initialized"}
            </h3>
            <p className="text-sm text-muted-foreground">
              Connect to a network with an active Sic Bo game.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Dice3 className="h-5 w-5" />
          Sic Bo Table
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Last Roll Display */}
          {lastRoll && (
            <div className="flex items-center justify-center gap-2 py-2">
              <span className="text-sm text-muted-foreground">Last Roll:</span>
              <div className="flex gap-2">
                {lastRoll.dice.map((d, i) => (
                  <div
                    key={i}
                    className="w-10 h-10 rounded bg-primary text-primary-foreground flex items-center justify-center font-bold"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <span className="text-sm font-medium">= {lastRoll.sum}</span>
            </div>
          )}

          {/* Big/Small Bets */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => addSmallBet(betAmount)}
              className="h-16 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors"
            >
              Small (4-10)
              <br />
              <span className="text-xs opacity-75">1:1</span>
            </button>
            <button
              onClick={() => addBigBet(betAmount)}
              className="h-16 rounded bg-red-600 hover:bg-red-500 text-white font-bold transition-colors"
            >
              Big (11-17)
              <br />
              <span className="text-xs opacity-75">1:1</span>
            </button>
          </div>

          {/* Sum Bets */}
          <div>
            <p className="text-sm text-muted-foreground mb-2">Total Sums (4-17)</p>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 14 }, (_, i) => i + 4).map((sum) => (
                <button
                  key={sum}
                  onClick={() => addSumBet(sum, betAmount)}
                  className="h-10 rounded bg-secondary hover:bg-secondary/80 text-sm font-medium transition-colors"
                >
                  {sum}
                </button>
              ))}
            </div>
          </div>

          {/* Single Dice Bets */}
          <div>
            <p className="text-sm text-muted-foreground mb-2">Single Dice (1-6)</p>
            <div className="grid grid-cols-6 gap-1">
              {[1, 2, 3, 4, 5, 6].map((num) => (
                <button
                  key={num}
                  onClick={() => addSingleBet(num, betAmount)}
                  className="h-12 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold transition-colors"
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Click bets to add ({betAmount.toFixed(2)} SICO each)
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default SicBoTable;
