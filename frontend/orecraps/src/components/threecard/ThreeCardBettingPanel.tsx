"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useThreeCardStore,
  useCanPlaceThreeCardBets,
  useAnteBetAmount,
  usePairPlusBetAmount,
} from "@/store/threeCardStore";
import { Coins } from "lucide-react";

export function ThreeCardBettingPanel() {
  const anteBetAmount = useAnteBetAmount();
  const pairPlusBetAmount = usePairPlusBetAmount();
  const { setAnteBetAmount, setPairPlusBetAmount } = useThreeCardStore();
  const { canBet, reason } = useCanPlaceThreeCardBets();

  const totalBet = anteBetAmount + pairPlusBetAmount;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-5 w-5" />
          Betting Panel
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Ante Bet */}
          <div>
            <label className="text-sm text-muted-foreground">Ante Bet (TCP)</label>
            <Input
              type="number"
              value={anteBetAmount}
              onChange={(e) => setAnteBetAmount(parseFloat(e.target.value) || 0)}
              min={0.01}
              step={0.01}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">Required to play</p>
          </div>

          {/* Pair Plus Bet */}
          <div>
            <label className="text-sm text-muted-foreground">Pair Plus Bet (TCP)</label>
            <Input
              type="number"
              value={pairPlusBetAmount}
              onChange={(e) => setPairPlusBetAmount(parseFloat(e.target.value) || 0)}
              min={0}
              step={0.01}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">Wins on pair or better</p>
          </div>

          {/* Total */}
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">Total Bet</span>
              <span className="font-bold">{totalBet.toFixed(2)} TCP</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <Button className="w-full" disabled={!canBet || anteBetAmount <= 0}>
              Deal Cards (Coming Soon)
            </Button>
          </div>

          {!canBet && reason && (
            <p className="text-sm text-muted-foreground text-center">{reason}</p>
          )}

          {/* Pay Table */}
          <div className="pt-4 border-t">
            <p className="text-sm font-medium mb-2">Pair Plus Payouts</p>
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Straight Flush</span><span>40:1</span>
              </div>
              <div className="flex justify-between">
                <span>Three of a Kind</span><span>30:1</span>
              </div>
              <div className="flex justify-between">
                <span>Straight</span><span>6:1</span>
              </div>
              <div className="flex justify-between">
                <span>Flush</span><span>3:1</span>
              </div>
              <div className="flex justify-between">
                <span>Pair</span><span>1:1</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ThreeCardBettingPanel;
