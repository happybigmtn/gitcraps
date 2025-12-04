"use client";

/**
 * WarBettingPanel Component
 *
 * Provides war betting functionality with:
 * - Ante bet (required)
 * - Tie bet (optional, 10:1 payout)
 * - Deal, Go to War, and Surrender actions
 * - Claim winnings
 */

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useWarStore, useWarGameState, useCanPlaceWarBets, useCanDealWar, useIsWarState } from "@/store/warStore";
import { useWar } from "@/hooks/useWar";
import { ONE_WAR } from "@/lib/solana";
import {
  Swords,
  Send,
  CheckCircle2,
  Shield,
  AlertCircle,
} from "lucide-react";

// War game states
const WAR_STATE_IDLE = 0;
const WAR_STATE_DEALT = 1;
const WAR_STATE_WAR = 2;
const WAR_STATE_SETTLED = 3;

function getWarStateName(state: number): string {
  switch (state) {
    case WAR_STATE_IDLE: return "Ready to Bet";
    case WAR_STATE_DEALT: return "Cards Dealt";
    case WAR_STATE_WAR: return "At War";
    case WAR_STATE_SETTLED: return "Settled";
    default: return "Unknown";
  }
}

export function WarBettingPanel() {
  const wallet = useWallet();
  const {
    game,
    position,
    houseBankroll,
  } = useWar();

  const gameState = useWarGameState();
  const { canBet: canPlaceBets } = useCanPlaceWarBets();
  const canDeal = useCanDealWar();
  const isWarState = useIsWarState();

  const { betAmount } = useWarStore();
  const [anteBet, setAnteBet] = useState(betAmount);
  const [tieBet, setTieBet] = useState(0);

  const totalBet = anteBet + tieBet;
  const hasPendingWinnings = position && position.pendingWinnings > 0n;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Swords className="h-5 w-5" />
            Betting Panel
          </div>
          {position && (
            <Badge variant="outline" className="text-xs">
              {getWarStateName(gameState)}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Place Bet Section */}
        {canPlaceBets && (
          <>
            <div className="space-y-3">
              <div>
                <Label htmlFor="anteBet" className="text-sm font-medium">
                  Ante Bet (Required)
                </Label>
                <div className="flex gap-2 mt-1.5">
                  <Input
                    id="anteBet"
                    type="number"
                    step="0.01"
                    min="0"
                    value={anteBet}
                    onChange={(e) => setAnteBet(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="font-mono"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAnteBet(betAmount)}
                  >
                    Default
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="tieBet" className="text-sm font-medium flex items-center gap-2">
                  Tie Bet (Optional)
                  <span className="text-xs text-muted-foreground">(10:1 payout)</span>
                </Label>
                <Input
                  id="tieBet"
                  type="number"
                  step="0.01"
                  min="0"
                  value={tieBet}
                  onChange={(e) => setTieBet(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="font-mono mt-1.5"
                />
              </div>

              <div className="flex items-center justify-between text-sm pt-2">
                <span className="text-muted-foreground">Total Bet:</span>
                <span className="font-mono font-semibold">
                  {totalBet.toFixed(4)} WAR
                </span>
              </div>
            </div>

            <Button
              disabled
              className="w-full"
            >
              <Send className="mr-2 h-4 w-4" />
              Place Bet (Coming Soon)
            </Button>
          </>
        )}

        {/* Deal Cards */}
        {canDeal && (
          <Button
            disabled
            className="w-full"
            variant="default"
          >
            <Swords className="mr-2 h-4 w-4" />
            Deal Cards (Coming Soon)
          </Button>
        )}

        {/* War or Surrender */}
        {isWarState && (
          <div className="space-y-2">
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <p className="text-sm font-medium text-yellow-600 dark:text-yellow-500 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                It's a tie! Choose your action:
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button disabled variant="default">
                <Swords className="mr-2 h-4 w-4" />
                Go to War
              </Button>
              <Button disabled variant="outline">
                <Shield className="mr-2 h-4 w-4" />
                Surrender
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              War doubles your bet. Surrender returns half your ante.
            </p>
          </div>
        )}

        {/* Claim Winnings */}
        {hasPendingWinnings && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                <span className="text-sm font-medium text-green-600 dark:text-green-500">
                  Pending Winnings:
                </span>
                <span className="font-mono font-semibold text-green-600 dark:text-green-500">
                  {(Number(position.pendingWinnings) / Number(ONE_WAR)).toFixed(4)} WAR
                </span>
              </div>

              <Button
                disabled
                className="w-full"
                variant="default"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Claim Winnings (Coming Soon)
              </Button>
            </div>
          </>
        )}

        {/* Game Info */}
        {game && (
          <>
            <Separator />
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">House Bankroll:</span>
                <span className="font-mono">
                  {(Number(houseBankroll) / Number(ONE_WAR)).toFixed(2)} WAR
                </span>
              </div>
              {position && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total Wagered:</span>
                    <span className="font-mono">
                      {(Number(position.totalWagered) / Number(ONE_WAR)).toFixed(4)} WAR
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total Won:</span>
                    <span className="font-mono text-green-600 dark:text-green-500">
                      {(Number(position.totalWon) / Number(ONE_WAR)).toFixed(4)} WAR
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total Lost:</span>
                    <span className="font-mono text-red-600 dark:text-red-500">
                      {(Number(position.totalLost) / Number(ONE_WAR)).toFixed(4)} WAR
                    </span>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {!wallet.connected && (
          <p className="text-sm text-muted-foreground text-center">
            Connect wallet to play Casino War
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default WarBettingPanel;
