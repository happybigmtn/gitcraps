"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useWarStore,
  useWarPendingBet,
  useWarBetAmount,
  useCanPlaceWarBets,
  useCanDealWar,
  useIsWarState,
} from "@/store/warStore";
import { Coins } from "lucide-react";

export function WarBettingPanel() {
  const pendingBet = useWarPendingBet();
  const betAmount = useWarBetAmount();
  const { canBet, reason } = useCanPlaceWarBets();
  const canDeal = useCanDealWar();
  const isWarState = useIsWarState();
  const { setBetAmount, setPendingBet, clearPendingBet } = useWarStore();

  const handleSetAnte = () => {
    setPendingBet({
      anteBet: betAmount,
      tieBet: 0,
    });
  };

  const handleSetAnteWithTie = () => {
    setPendingBet({
      anteBet: betAmount,
      tieBet: betAmount * 0.5,
    });
  };

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
            <label className="text-sm text-muted-foreground">Bet Amount (WAR)</label>
            <Input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(parseFloat(e.target.value) || 0.01)}
              min={0.01}
              step={0.01}
              className="mt-1"
            />
          </div>

          {/* Quick Bet Buttons */}
          {canBet && !pendingBet && (
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={handleSetAnte} variant="secondary">
                Ante Only
              </Button>
              <Button onClick={handleSetAnteWithTie} variant="secondary">
                Ante + Tie Bet
              </Button>
            </div>
          )}

          {/* Pending Bet Display */}
          {pendingBet && (
            <div className="p-3 rounded bg-secondary/50 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Ante Bet</span>
                <span className="font-medium">{pendingBet.anteBet.toFixed(2)} WAR</span>
              </div>
              {pendingBet.tieBet > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Tie Bet</span>
                  <span className="font-medium">{pendingBet.tieBet.toFixed(2)} WAR</span>
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={clearPendingBet}
                className="w-full mt-2"
              >
                Clear
              </Button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2">
            {pendingBet && canBet && (
              <Button className="w-full" disabled>
                Place Bet (Coming Soon)
              </Button>
            )}
            {canDeal && (
              <Button className="w-full" variant="default" disabled>
                Deal Cards (Coming Soon)
              </Button>
            )}
            {isWarState && (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="default" disabled>
                  Go to War!
                </Button>
                <Button variant="outline" disabled>
                  Surrender
                </Button>
              </div>
            )}
          </div>

          {!canBet && reason && (
            <p className="text-sm text-muted-foreground text-center">{reason}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default WarBettingPanel;
