"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUTH } from "@/hooks/useUTH";
import { useUTHHouseBankroll, useUTHPendingWinnings, useUTHTotalBets } from "@/store/uthStore";
import { Info } from "lucide-react";

export function UTHGameStatus() {
  const { game, position, loading } = useUTH();
  const houseBankroll = useUTHHouseBankroll();
  const pendingWinnings = useUTHPendingWinnings();
  const totalBets = useUTHTotalBets();

  if (!game) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Info className="h-5 w-5" />
          Game Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Epoch ID:</span>
            <span className="font-medium">{game.epochId.toString()}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-muted-foreground">House Bankroll:</span>
            <span className="font-medium">{houseBankroll.toFixed(2)} UTH</span>
          </div>

          {position && (
            <>
              <div className="border-t pt-3 space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Bets:</span>
                  <span className="font-medium">{totalBets.toFixed(2)} UTH</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pending Winnings:</span>
                  <span className="font-medium text-green-600 dark:text-green-400">
                    {pendingWinnings.toFixed(2)} UTH
                  </span>
                </div>

                <div className="border-t pt-3 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Wagered:</span>
                    <span className="font-medium">
                      {(Number(position.totalWagered) / 1e9).toFixed(2)} UTH
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Won:</span>
                    <span className="font-medium text-green-600 dark:text-green-400">
                      {(Number(position.totalWon) / 1e9).toFixed(2)} UTH
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Lost:</span>
                    <span className="font-medium text-red-600 dark:text-red-400">
                      {(Number(position.totalLost) / 1e9).toFixed(2)} UTH
                    </span>
                  </div>

                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-muted-foreground">Net Profit:</span>
                    <span className={`font-medium ${
                      Number(position.totalWon - position.totalLost) >= 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}>
                      {((Number(position.totalWon) - Number(position.totalLost)) / 1e9).toFixed(2)} UTH
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
