"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, TrendingUp, ArrowDownToLine, ArrowUpFromLine, Gift } from "lucide-react";
import { SwapPanel } from "@/components/exchange/SwapPanel";

export function StakeLayout() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Token Exchange Panel */}
      <SwapPanel />

      {/* Staking Info Panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            RNG Staking
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-3">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-base font-semibold mb-2">Staking Coming Soon</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Stake RNG to earn yield from exchange protocol fees.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Card className="bg-secondary/30">
              <CardContent className="p-3 text-center">
                <ArrowDownToLine className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground" />
                <h4 className="font-medium text-xs">Deposit</h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Stake RNG
                </p>
              </CardContent>
            </Card>

            <Card className="bg-secondary/30">
              <CardContent className="p-3 text-center">
                <ArrowUpFromLine className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground" />
                <h4 className="font-medium text-xs">Withdraw</h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Unstake
                </p>
              </CardContent>
            </Card>

            <Card className="bg-secondary/30">
              <CardContent className="p-3 text-center">
                <Gift className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground" />
                <h4 className="font-medium text-xs">Claim</h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Rewards
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="text-center text-xs text-muted-foreground/60">
            <p>Stakers earn 50% of protocol fees from swaps</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default StakeLayout;
