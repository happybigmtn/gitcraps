"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useThreeCardGame, useThreeCardHouseBankroll, useThreeCardPendingWinnings } from "@/store/threeCardStore";
import { Info } from "lucide-react";

export function ThreeCardGameStatus() {
  const game = useThreeCardGame();
  const houseBankroll = useThreeCardHouseBankroll();
  const pendingWinnings = useThreeCardPendingWinnings();

  if (!game) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="h-4 w-4" />
          Game Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">House Bankroll</p>
            <p className="font-medium">{houseBankroll.toFixed(2)} TCP</p>
          </div>
          <div>
            <p className="text-muted-foreground">Pending Winnings</p>
            <p className="font-medium text-green-500">{pendingWinnings.toFixed(2)} TCP</p>
          </div>
          <div>
            <p className="text-muted-foreground">Epoch</p>
            <p className="font-medium">{game.epochId.toString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Total Wagered</p>
            <p className="font-medium">{(Number(game.totalWagered ?? 0n) / 1e9).toFixed(2)} TCP</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ThreeCardGameStatus;
