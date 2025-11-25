"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useGameStore, useWinRate } from "@/store/gameStore";
import { formatSol, formatCrap } from "@/lib/solana";
import { toast } from "sonner";
import { User, Coins, TrendingUp, Gift, Award } from "lucide-react";

interface PlayerStatsProps {
  minerData?: {
    rewardsSol: bigint;
    rewardsCrap: bigint;
    lifetimeRewardsSol: bigint;
    lifetimeRewardsCrap: bigint;
    dicePrediction: number;
  } | null;
  onClaimSol?: () => void;
  onClaimCrap?: () => void;
}

export function PlayerStats({
  minerData,
  onClaimSol,
  onClaimCrap,
}: PlayerStatsProps) {
  const { connected, publicKey } = useWallet();
  const { roundHistory } = useGameStore();
  const winRate = useWinRate();

  if (!connected) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            Connect your wallet to view stats
          </p>
        </CardContent>
      </Card>
    );
  }

  const claimableSol = minerData?.rewardsSol || 0n;
  const claimableCrap = minerData?.rewardsCrap || 0n;
  const lifetimeSol = minerData?.lifetimeRewardsSol || 0n;
  const lifetimeCrap = minerData?.lifetimeRewardsCrap || 0n;

  const handleClaimSol = async () => {
    try {
      toast.info("Claiming SOL...");
      // TODO: Implement actual claim
      await new Promise((resolve) => setTimeout(resolve, 1000));
      onClaimSol?.();
      toast.success("SOL claimed successfully!");
    } catch (error) {
      toast.error("Failed to claim SOL");
    }
  };

  const handleClaimCrap = async () => {
    try {
      toast.info("Claiming CRAP...");
      // TODO: Implement actual claim
      await new Promise((resolve) => setTimeout(resolve, 1000));
      onClaimCrap?.();
      toast.success("CRAP claimed successfully!");
    } catch (error) {
      toast.error("Failed to claim CRAP");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Your Stats
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Claimable Rewards */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Gift className="h-4 w-4" />
            Claimable Rewards
          </h4>

          <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
            <div>
              <div className="text-xs text-muted-foreground">SOL</div>
              <div className="font-mono font-bold text-chart-2">
                {formatSol(claimableSol)}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleClaimSol}
              disabled={claimableSol === 0n}
            >
              Claim
            </Button>
          </div>

          <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
            <div>
              <div className="text-xs text-muted-foreground">CRAP</div>
              <div className="font-mono font-bold text-chart-1">
                {formatCrap(claimableCrap)}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleClaimCrap}
              disabled={claimableCrap === 0n}
            >
              Claim
            </Button>
          </div>
        </div>

        <Separator />

        {/* Lifetime Stats */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Lifetime Earnings
          </h4>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-secondary/30 rounded-lg">
              <div className="text-xs text-muted-foreground">Total SOL</div>
              <div className="font-mono font-bold">{formatSol(lifetimeSol)}</div>
            </div>
            <div className="p-3 bg-secondary/30 rounded-lg">
              <div className="text-xs text-muted-foreground">Total CRAP</div>
              <div className="font-mono font-bold">{formatCrap(lifetimeCrap)}</div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Dice Stats */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Award className="h-4 w-4" />
            Dice Performance
          </h4>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-secondary/30 rounded-lg">
              <div className="text-xs text-muted-foreground">Rounds Played</div>
              <div className="font-mono font-bold">{roundHistory.length}</div>
            </div>
            <div className="p-3 bg-secondary/30 rounded-lg">
              <div className="text-xs text-muted-foreground">Win Rate</div>
              <div className="font-mono font-bold">
                {winRate.toFixed(1)}%
                {winRate > 50 && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    Hot!
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {minerData?.dicePrediction !== undefined && (
            <div className="p-3 bg-primary/10 rounded-lg">
              <div className="text-xs text-muted-foreground">
                Current Prediction
              </div>
              <div className="font-mono font-bold text-primary">
                {minerData.dicePrediction === 0
                  ? "SAFE MODE"
                  : minerData.dicePrediction}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
