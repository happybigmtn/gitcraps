"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useSicBoStore,
  useSicBoPendingBets,
  useSicBoBetAmount,
  useSicBoTotalPendingAmount,
  getSicBoBetTypeName,
} from "@/store/sicboStore";
import { Coins, Trash2 } from "lucide-react";

export function SicBoBettingPanel() {
  const pendingBets = useSicBoPendingBets();
  const betAmount = useSicBoBetAmount();
  const totalPending = useSicBoTotalPendingAmount();
  const { setBetAmount, removePendingBet, clearPendingBets } = useSicBoStore();

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
          {/* Bet Amount Input */}
          <div>
            <label className="text-sm text-muted-foreground">Bet Amount (SICO)</label>
            <Input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(parseFloat(e.target.value) || 0.01)}
              min={0.01}
              step={0.01}
              className="mt-1"
            />
          </div>

          {/* Pending Bets List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Pending Bets</span>
              {pendingBets.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearPendingBets}
                  className="h-6 text-xs"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              )}
            </div>
            {pendingBets.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No pending bets. Click on the table to add bets.
              </p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {pendingBets.map((bet, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded bg-secondary/50 text-sm"
                  >
                    <span>{getSicBoBetTypeName(bet.betType, bet.betIndex)}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{bet.amount.toFixed(2)}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removePendingBet(idx)}
                        className="h-6 w-6 p-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Total and Submit */}
          {pendingBets.length > 0 && (
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="font-bold">{totalPending.toFixed(2)} SICO</span>
              </div>
              <Button className="w-full" disabled>
                Place Bets (Coming Soon)
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default SicBoBettingPanel;
