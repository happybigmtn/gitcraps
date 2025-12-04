"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSicBoGame, useSicBoHouseBankroll, useSicBoPendingWinnings } from "@/store/sicboStore";
import { Info } from "lucide-react";

export function SicBoGameStatus() {
  const game = useSicBoGame();
  const houseBankroll = useSicBoHouseBankroll();
  const pendingWinnings = useSicBoPendingWinnings();

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
            <p className="font-medium">{houseBankroll.toFixed(2)} SICO</p>
          </div>
          <div>
            <p className="text-muted-foreground">Pending Winnings</p>
            <p className="font-medium text-green-500">{pendingWinnings.toFixed(2)} SICO</p>
          </div>
          <div>
            <p className="text-muted-foreground">Epoch</p>
            <p className="font-medium">{game.epochId.toString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Last Dice</p>
            <p className="font-medium">
              {game.lastDice && game.lastDice.some((d: number) => d > 0)
                ? game.lastDice.join(", ")
                : "-"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default SicBoGameStatus;
