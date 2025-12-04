"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useUTHStore,
  useCanPlaceAnte,
  useCanBetPreflop,
  useCanBetFlop,
  useCanBetRiver,
  useUTHPhaseName,
} from "@/store/uthStore";
import { DollarSign } from "lucide-react";

export function UTHBettingPanel() {
  const {
    anteAmount,
    blindAmount,
    tripsAmount,
    setAnteAmount,
    setBlindAmount,
    setTripsAmount,
  } = useUTHStore();

  const { canBet: canPlaceAnte, reason: anteReason } = useCanPlaceAnte();
  const { canBet: canBetPreflop } = useCanBetPreflop();
  const { canBet: canBetFlop } = useCanBetFlop();
  const { canBet: canBetRiver } = useCanBetRiver();
  const phaseName = useUTHPhaseName();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Betting
          <span className="ml-auto text-sm font-normal text-muted-foreground">
            {phaseName}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Ante Betting (Betting phase) */}
        {canPlaceAnte && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ante">Ante (required)</Label>
              <Input
                id="ante"
                type="number"
                step="0.01"
                min="0.01"
                value={anteAmount}
                onChange={(e) => setAnteAmount(Number(e.target.value))}
                placeholder="0.01"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="blind">Blind (required, equal to ante)</Label>
              <Input
                id="blind"
                type="number"
                step="0.01"
                min="0.01"
                value={blindAmount}
                onChange={(e) => setBlindAmount(Number(e.target.value))}
                placeholder="0.01"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="trips">Trips (optional side bet)</Label>
              <Input
                id="trips"
                type="number"
                step="0.01"
                min="0"
                value={tripsAmount}
                onChange={(e) => setTripsAmount(Number(e.target.value))}
                placeholder="0.00"
              />
            </div>

            <Button disabled className="w-full">
              Place Ante (Coming Soon)
            </Button>

            {anteReason && (
              <p className="text-sm text-muted-foreground">{anteReason}</p>
            )}
          </div>
        )}

        {/* Preflop Betting */}
        {canBetPreflop && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-2">
              Place a play bet of 3x or 4x your ante, or check
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Button disabled variant="default">4x Play</Button>
              <Button disabled variant="default">3x Play</Button>
              <Button disabled variant="outline">Check</Button>
            </div>
          </div>
        )}

        {/* Flop Betting */}
        {canBetFlop && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-2">
              Place a 2x play bet, or check
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button disabled variant="default">2x Play</Button>
              <Button disabled variant="outline">Check</Button>
            </div>
          </div>
        )}

        {/* River Betting */}
        {canBetRiver && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-2">
              Place a 1x play bet, or fold
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button disabled variant="default">1x Play</Button>
              <Button disabled variant="destructive">Fold</Button>
            </div>
          </div>
        )}

        {/* Pay Tables */}
        <div className="pt-4 border-t space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-2">Blind Pay Table (on win)</h4>
            <div className="text-xs space-y-1">
              <div className="flex justify-between"><span>Royal Flush</span><span>500:1</span></div>
              <div className="flex justify-between"><span>Straight Flush</span><span>50:1</span></div>
              <div className="flex justify-between"><span>Four of a Kind</span><span>10:1</span></div>
              <div className="flex justify-between"><span>Full House</span><span>3:1</span></div>
              <div className="flex justify-between"><span>Flush</span><span>3:2</span></div>
              <div className="flex justify-between"><span>Straight</span><span>1:1</span></div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2">Trips Pay Table</h4>
            <div className="text-xs space-y-1">
              <div className="flex justify-between"><span>Royal Flush</span><span>50:1</span></div>
              <div className="flex justify-between"><span>Straight Flush</span><span>40:1</span></div>
              <div className="flex justify-between"><span>Four of a Kind</span><span>30:1</span></div>
              <div className="flex justify-between"><span>Full House</span><span>8:1</span></div>
              <div className="flex justify-between"><span>Flush</span><span>7:1</span></div>
              <div className="flex justify-between"><span>Straight</span><span>4:1</span></div>
              <div className="flex justify-between"><span>Three of a Kind</span><span>3:1</span></div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
