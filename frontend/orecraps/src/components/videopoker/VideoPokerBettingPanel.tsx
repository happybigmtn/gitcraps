"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useVideoPokerStore,
  useVideoPokerCoins,
  useVideoPokerBetPerCoin,
  useCanPlaceVideoPokerBet,
  useCanHoldDrawVideoPoker,
  useVideoPokerTotalBet,
} from "@/store/videoPokerStore";
import { Coins } from "lucide-react";

export function VideoPokerBettingPanel() {
  const coins = useVideoPokerCoins();
  const betPerCoin = useVideoPokerBetPerCoin();
  const totalBet = useVideoPokerTotalBet();
  const { canBet, reason: betReason } = useCanPlaceVideoPokerBet();
  const { canHoldDraw, reason: holdReason } = useCanHoldDrawVideoPoker();
  const { setCoins, setBetPerCoin, clearHolds } = useVideoPokerStore();

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
          {/* Coins Selection */}
          <div>
            <label className="text-sm text-muted-foreground">Coins (1-5)</label>
            <div className="flex gap-2 mt-1">
              {[1, 2, 3, 4, 5].map((c) => (
                <Button
                  key={c}
                  variant={coins === c ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCoins(c)}
                  className="flex-1"
                >
                  {c}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">5 coins for max Royal Flush payout</p>
          </div>

          {/* Bet Per Coin */}
          <div>
            <label className="text-sm text-muted-foreground">Bet Per Coin (VPK)</label>
            <Input
              type="number"
              value={betPerCoin}
              onChange={(e) => setBetPerCoin(parseFloat(e.target.value) || 0.01)}
              min={0.01}
              step={0.01}
              className="mt-1"
            />
          </div>

          {/* Total Bet */}
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">Total Bet</span>
              <span className="font-bold">{totalBet.toFixed(2)} VPK</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            {canBet && (
              <Button className="w-full" disabled>
                Deal Cards (Coming Soon)
              </Button>
            )}
            {canHoldDraw && (
              <>
                <Button className="w-full" disabled>
                  Draw Cards (Coming Soon)
                </Button>
                <Button variant="outline" className="w-full" onClick={clearHolds}>
                  Clear Holds
                </Button>
              </>
            )}
          </div>

          {!canBet && betReason && (
            <p className="text-sm text-muted-foreground text-center">{betReason}</p>
          )}

          {/* Pay Table */}
          <div className="pt-4 border-t">
            <p className="text-sm font-medium mb-2">Payouts ({coins} coin{coins > 1 ? "s" : ""})</p>
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Royal Flush</span>
                <span>{coins === 5 ? "4000" : coins * 250}x</span>
              </div>
              <div className="flex justify-between">
                <span>Straight Flush</span><span>{coins * 50}x</span>
              </div>
              <div className="flex justify-between">
                <span>Four of a Kind</span><span>{coins * 25}x</span>
              </div>
              <div className="flex justify-between">
                <span>Full House</span><span>{coins * 9}x</span>
              </div>
              <div className="flex justify-between">
                <span>Flush</span><span>{coins * 6}x</span>
              </div>
              <div className="flex justify-between">
                <span>Straight</span><span>{coins * 4}x</span>
              </div>
              <div className="flex justify-between">
                <span>Three of a Kind</span><span>{coins * 3}x</span>
              </div>
              <div className="flex justify-between">
                <span>Two Pair</span><span>{coins * 2}x</span>
              </div>
              <div className="flex justify-between">
                <span>Jacks or Better</span><span>{coins * 1}x</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default VideoPokerBettingPanel;
