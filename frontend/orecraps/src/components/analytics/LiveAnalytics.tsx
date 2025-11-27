"use client";

import { useState, useEffect, useMemo } from "react";
import { useAnalyticsStore } from "@/store/analyticsStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Layers,
  Target,
  Sparkles,
} from "lucide-react";

// Compact bar for sum distribution
function MiniBar({ value, max, sum }: { value: number; max: number; sum: number }) {
  const percentage = max > 0 ? (value / max) * 100 : 0;

  // Color based on sum probability
  const getColor = () => {
    if (sum === 7) return "bg-green-500";
    if (sum === 6 || sum === 8) return "bg-yellow-500";
    if (sum >= 4 && sum <= 10) return "bg-orange-500";
    return "bg-red-500";
  };

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="w-4 h-12 bg-secondary/50 rounded-sm overflow-hidden flex flex-col-reverse">
        <div
          className={cn("w-full transition-all", getColor())}
          style={{ height: `${percentage}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground">{sum}</span>
      <span className="text-[9px] font-mono">{value}</span>
    </div>
  );
}

export function LiveAnalytics() {
  const [mounted, setMounted] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { sessions, currentSession, getAggregateStats } = useAnalyticsStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-refresh every 10 seconds for live updates (reduced from 1s for scalability)
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey((k) => k + 1);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const stats = useMemo(
    () => getAggregateStats(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, currentSession, refreshKey]
  );

  // Sum distribution data
  const sumData = useMemo(() => {
    const sums = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    return sums.map((sum) => ({
      sum,
      value: stats.sumDistribution[sum] || 0,
    }));
  }, [stats.sumDistribution]);

  const maxSumCount = Math.max(...sumData.map((d) => d.value), 1);

  // Strategy performance sorted by ROI
  const strategyData = useMemo(() => {
    return Object.entries(stats.strategyPerformance)
      .map(([strategy, data]) => ({
        name: strategy.replace(" Bot", ""),
        roi: data.roi,
        net: data.crapEarned - data.rngSpent,
      }))
      .sort((a, b) => b.roi - a.roi);
  }, [stats.strategyPerformance]);

  // Overall ROI
  const overallRoi = stats.totalRngStaked > 0
    ? ((stats.totalCrapEarned - stats.totalRngStaked) / stats.totalRngStaked) * 100
    : 0;

  if (!mounted) {
    return null;
  }

  if (stats.totalEpochs === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Live Analytics
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground text-center py-4">
          Run simulations to see analytics
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Live Analytics
          <span className="text-[10px] font-normal text-muted-foreground ml-auto">
            E#{stats.totalEpochs} R#{stats.totalRounds}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Key Stats Row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-secondary/50 rounded p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground">
              <Target className="h-3 w-3" />
              <span className="text-[10px]">RNG</span>
            </div>
            <p className="text-xs font-mono font-bold">{stats.totalRngStaked.toFixed(0)}</p>
          </div>
          <div className="bg-secondary/50 rounded p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              <span className="text-[10px]">CRAP</span>
            </div>
            <p className="text-xs font-mono font-bold text-green-500">
              {stats.totalCrapEarned.toFixed(0)}
            </p>
          </div>
          <div className="bg-secondary/50 rounded p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground">
              {overallRoi >= 0 ? (
                <TrendingUp className="h-3 w-3 text-green-500" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-500" />
              )}
              <span className="text-[10px]">ROI</span>
            </div>
            <p
              className={cn(
                "text-xs font-mono font-bold",
                overallRoi >= 0 ? "text-green-500" : "text-red-500"
              )}
            >
              {overallRoi >= 0 ? "+" : ""}{overallRoi.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Sum Distribution */}
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">Sum Distribution</p>
          <div className="flex justify-between">
            {sumData.map((d) => (
              <MiniBar key={d.sum} value={d.value} max={maxSumCount} sum={d.sum} />
            ))}
          </div>
        </div>

        {/* Strategy ROI Leaderboard */}
        {strategyData.length > 0 && (
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Strategy ROI</p>
            <div className="space-y-1">
              {strategyData.slice(0, 5).map((s, i) => (
                <div
                  key={s.name}
                  className={cn(
                    "flex items-center justify-between text-[11px] px-1.5 py-0.5 rounded",
                    i === 0 && s.roi > 0 && "bg-green-500/10"
                  )}
                >
                  <span className="font-medium">{s.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-[10px]">
                      {s.net >= 0 ? "+" : ""}{s.net.toFixed(0)}
                    </span>
                    <span
                      className={cn(
                        "font-mono font-bold w-14 text-right",
                        s.roi >= 0 ? "text-green-500" : "text-red-500"
                      )}
                    >
                      {s.roi >= 0 ? "+" : ""}{s.roi.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bonus Stats */}
        <div className="flex justify-between text-[10px] text-muted-foreground pt-1 border-t">
          <span>Bonus Rate: {stats.bonusHitRate.toFixed(0)}%</span>
          <span>Avg R/E: {stats.avgRoundsPerEpoch.toFixed(1)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
