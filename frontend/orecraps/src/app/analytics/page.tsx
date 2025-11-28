"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAnalyticsStore, SimulationSession } from "@/store/analyticsStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dices,
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart,
  Activity,
  Target,
  Sparkles,
  Clock,
  ArrowLeft,
  Trash2,
  Download,
  RefreshCw,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Simple bar chart component
function BarChart({
  data,
  label,
  maxValue,
  color = "bg-primary",
}: {
  data: { label: string; value: number }[];
  label: string;
  maxValue: number;
  color?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground mb-2">{label}</div>
      <div className="space-y-1">
        {data.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs font-mono w-6">{item.label}</span>
            <div className="flex-1 h-4 bg-secondary rounded overflow-hidden">
              <div
                className={cn("h-full transition-all", color)}
                style={{ width: `${(item.value / maxValue) * 100}%` }}
              />
            </div>
            <span className="text-xs font-mono w-12 text-right">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Stat card component
function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  className,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div
            className={cn(
              "p-2 rounded-lg",
              trend === "up" && "bg-green-500/10 text-green-500",
              trend === "down" && "bg-red-500/10 text-red-500",
              !trend && "bg-primary/10 text-primary"
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Session card component
function SessionCard({ session }: { session: SimulationSession }) {
  const duration = session.endTime
    ? Math.round((session.endTime - session.startTime) / 1000)
    : null;

  const totalRng = session.epochs.reduce((acc, e) => acc + e.totalRngStaked, 0);
  const totalCrap = session.epochs.reduce(
    (acc, e) => acc + e.totalCrapEarned + e.totalBonusCrap,
    0
  );
  const roi = totalRng > 0 ? ((totalCrap - totalRng) / totalRng) * 100 : 0;

  return (
    <Card className={cn(session.status === "running" && "border-primary")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge
                variant={session.status === "completed" ? "default" : "secondary"}
              >
                {session.status}
              </Badge>
              <Badge variant="outline">{session.network}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(session.startTime).toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-mono">
              {session.epochs.length}/{session.totalEpochs} epochs
            </p>
            {duration && (
              <p className="text-xs text-muted-foreground">{duration}s</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-secondary/50 rounded p-2">
            <p className="text-muted-foreground">RNG Staked</p>
            <p className="font-mono font-bold">{totalRng.toFixed(0)}</p>
          </div>
          <div className="bg-secondary/50 rounded p-2">
            <p className="text-muted-foreground">CRAP Earned</p>
            <p className="font-mono font-bold text-green-500">
              {totalCrap.toFixed(0)}
            </p>
          </div>
          <div className="bg-secondary/50 rounded p-2">
            <p className="text-muted-foreground">ROI</p>
            <p
              className={cn(
                "font-mono font-bold",
                roi >= 0 ? "text-green-500" : "text-red-500"
              )}
            >
              {roi.toFixed(1)}%
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const [mounted, setMounted] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { sessions, currentSession, getAggregateStats, clearSessions } =
    useAnalyticsStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Force refresh every 2 seconds when there's a running session
  // This ensures live updates as epochs are recorded
  useEffect(() => {
    if (!currentSession || currentSession.status !== "running") return;

    const interval = setInterval(() => {
      setRefreshKey((k) => k + 1);
    }, 2000);

    return () => clearInterval(interval);
  }, [currentSession]);

  // Include refreshKey in deps to force recalculation
  const stats = useMemo(
    () => getAggregateStats(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, currentSession, refreshKey]
  );

  // Sum distribution for bar chart
  const sumChartData = useMemo(() => {
    const sums = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    return sums.map((sum) => ({
      label: String(sum),
      value: stats.sumDistribution[sum] || 0,
    }));
  }, [stats.sumDistribution]);

  const maxSumCount = Math.max(...sumChartData.map((d) => d.value), 1);

  // Strategy performance for chart
  const strategyChartData = useMemo(() => {
    return Object.entries(stats.strategyPerformance)
      .map(([strategy, data]) => ({
        label: strategy.replace(" Bot", ""),
        value: data.roi,
        rng: data.rngSpent,
        crap: data.crapEarned,
      }))
      .sort((a, b) => b.value - a.value);
  }, [stats.strategyPerformance]);

  // Export data
  const exportData = () => {
    const data = {
      exportDate: new Date().toISOString(),
      stats,
      sessions,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orecraps-analytics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <BarChart3 className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">Analytics Dashboard</span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportData}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm("Clear all analytics data?")) {
                  clearSessions();
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <ErrorBoundary>
          {stats.totalEpochs === 0 ? (
            <Card className="p-12 text-center">
              <BarChart3 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-bold mb-2">No Analytics Data Yet</h2>
              <p className="text-muted-foreground mb-4">
                Run simulations on the main page to collect analytics data.
              </p>
              <Link href="/">
                <Button>
                  <Dices className="h-4 w-4 mr-2" />
                  Start Simulation
                </Button>
              </Link>
            </Card>
          ) : (
            <>
              {/* Overview Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard
                  title="Total Epochs"
                  value={stats.totalEpochs}
                  subtitle={`${stats.totalRounds} rounds`}
                  icon={Layers}
                />
                <StatCard
                  title="Avg Rounds/Epoch"
                  value={stats.avgRoundsPerEpoch.toFixed(1)}
                  subtitle="Before 7-out"
                  icon={Activity}
                />
                <StatCard
                  title="Total RNG Staked"
                  value={stats.totalRngStaked.toFixed(0)}
                  icon={Target}
                />
                <StatCard
                  title="Total CRAP Earned"
                  value={stats.totalCrapEarned.toFixed(0)}
                  icon={Sparkles}
                  trend={stats.totalCrapEarned > stats.totalRngStaked ? "up" : "down"}
                />
              </div>

              {/* Bonus Stats */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <StatCard
                  title="Bonus Hit Rate"
                  value={`${stats.bonusHitRate.toFixed(1)}%`}
                  subtitle="Epochs with 5+ unique sums"
                  icon={Sparkles}
                  trend={stats.bonusHitRate > 50 ? "up" : "neutral"}
                />
                <StatCard
                  title="Overall ROI"
                  value={`${(
                    ((stats.totalCrapEarned - stats.totalRngStaked) /
                      Math.max(stats.totalRngStaked, 1)) *
                    100
                  ).toFixed(1)}%`}
                  subtitle="(CRAP - RNG) / RNG"
                  icon={stats.totalCrapEarned >= stats.totalRngStaked ? TrendingUp : TrendingDown}
                  trend={stats.totalCrapEarned >= stats.totalRngStaked ? "up" : "down"}
                />
                <StatCard
                  title="Sessions"
                  value={sessions.length + (currentSession ? 1 : 0)}
                  subtitle={currentSession ? "1 running" : "All completed"}
                  icon={Clock}
                />
              </div>

              {/* Detailed Analytics */}
              <Tabs defaultValue="distribution" className="mb-6">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="distribution">
                    <PieChart className="h-4 w-4 mr-2" />
                    Sum Distribution
                  </TabsTrigger>
                  <TabsTrigger value="strategies">
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Strategy Performance
                  </TabsTrigger>
                  <TabsTrigger value="sessions">
                    <Layers className="h-4 w-4 mr-2" />
                    Session History
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="distribution" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Dice Sum Distribution</CardTitle>
                      <CardDescription>
                        Frequency of each dice sum across all rolls
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <BarChart
                        data={sumChartData}
                        label="Sum frequency"
                        maxValue={maxSumCount}
                        color="bg-primary"
                      />
                      <div className="mt-4 pt-4 border-t">
                        <p className="text-xs text-muted-foreground mb-2">
                          Expected vs Actual (per 36 rolls)
                        </p>
                        <div className="grid grid-cols-6 gap-2 text-xs">
                          {[
                            { sum: 2, expected: 1 },
                            { sum: 3, expected: 2 },
                            { sum: 4, expected: 3 },
                            { sum: 5, expected: 4 },
                            { sum: 6, expected: 5 },
                            { sum: 7, expected: 6 },
                            { sum: 8, expected: 5 },
                            { sum: 9, expected: 4 },
                            { sum: 10, expected: 3 },
                            { sum: 11, expected: 2 },
                            { sum: 12, expected: 1 },
                          ].map(({ sum, expected }) => {
                            const actual = stats.sumDistribution[sum] || 0;
                            const totalRolls = Object.values(stats.sumDistribution).reduce(
                              (a, b) => a + b,
                              0
                            );
                            const normalizedActual =
                              totalRolls > 0 ? (actual / totalRolls) * 36 : 0;
                            const diff = normalizedActual - expected;

                            return (
                              <div
                                key={sum}
                                className={cn(
                                  "p-2 rounded text-center",
                                  Math.abs(diff) > 1
                                    ? diff > 0
                                      ? "bg-green-500/10"
                                      : "bg-red-500/10"
                                    : "bg-secondary/50"
                                )}
                              >
                                <div className="font-bold">{sum}</div>
                                <div className="text-muted-foreground">
                                  {normalizedActual.toFixed(1)}
                                </div>
                                <div
                                  className={cn(
                                    "text-[10px]",
                                    diff > 0 ? "text-green-500" : "text-red-500"
                                  )}
                                >
                                  {diff >= 0 ? "+" : ""}
                                  {diff.toFixed(1)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="strategies" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Bot Strategy Performance</CardTitle>
                      <CardDescription>
                        ROI comparison across different betting strategies
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {strategyChartData.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">
                          No strategy data available
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {strategyChartData.map((strategy, i) => (
                            <div
                              key={strategy.label}
                              className={cn(
                                "p-3 rounded-lg",
                                i === 0 && "bg-green-500/10 border border-green-500/20"
                              )}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium">{strategy.label}</span>
                                <span
                                  className={cn(
                                    "font-mono font-bold",
                                    strategy.value >= 0 ? "text-green-500" : "text-red-500"
                                  )}
                                >
                                  {strategy.value >= 0 ? "+" : ""}
                                  {strategy.value.toFixed(1)}% ROI
                                </span>
                              </div>
                              <div className="flex gap-4 text-xs text-muted-foreground">
                                <span>RNG: {strategy.rng.toFixed(0)}</span>
                                <span>CRAP: {strategy.crap.toFixed(0)}</span>
                                <span>
                                  Net: {(strategy.crap - strategy.rng).toFixed(0)}
                                </span>
                              </div>
                              <div className="mt-2 h-2 bg-secondary rounded overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full",
                                    strategy.value >= 0 ? "bg-green-500" : "bg-red-500"
                                  )}
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      Math.abs(strategy.value) + 50
                                    )}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="sessions" className="mt-4">
                  <div className="space-y-4">
                    {currentSession && (
                      <div>
                        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                          <Activity className="h-4 w-4 text-primary animate-pulse" />
                          Current Session
                        </h3>
                        <SessionCard session={currentSession} />
                      </div>
                    )}

                    {sessions.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium mb-2">Previous Sessions</h3>
                        <div className="space-y-3">
                          {[...sessions].reverse().map((session) => (
                            <SessionCard key={session.id} session={session} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              {/* Quick Actions */}
              <Card>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">Ready to run more simulations?</p>
                    <p className="text-sm text-muted-foreground">
                      Data will be added to existing analytics
                    </p>
                  </div>
                  <Link href="/">
                    <Button>
                      <Dices className="h-4 w-4 mr-2" />
                      Back to Game
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </>
          )}
        </ErrorBoundary>
      </main>

      {/* Footer */}
      <footer className="border-t mt-6 py-3">
        <div className="container mx-auto px-4 text-center text-xs text-muted-foreground">
          OreCraps Analytics | Simulation data stored locally
        </div>
      </footer>
    </div>
  );
}
