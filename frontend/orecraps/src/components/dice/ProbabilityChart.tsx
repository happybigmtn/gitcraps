"use client";

import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DICE_MULTIPLIERS, getRiskColor, squareToSum } from "@/lib/dice";
import { useGameStore } from "@/store/gameStore";
import { BarChart3, Loader2 } from "lucide-react";

export function ProbabilityChart() {
  const [mounted, setMounted] = useState(false);
  const { selectedSquares } = useGameStore();

  // Only render chart after client mount to avoid SSR dimension warnings
  useEffect(() => {
    setMounted(true);
  }, []);

  // Count how many combinations are selected for each sum
  const getSelectedCountForSum = (sum: number): number => {
    return selectedSquares.reduce((count, selected, index) => {
      if (!selected) return count;
      return squareToSum(index) === sum ? count + 1 : count;
    }, 0);
  };

  const data = DICE_MULTIPLIERS.filter((m) => m.sum >= 2).map((m) => {
    const selectedCount = getSelectedCountForSum(m.sum);
    return {
      sum: m.sum.toString(),
      probability: m.probability * 100,
      ways: m.ways,
      multiplier: m.multiplier,
      selectedCount,
      isSelected: selectedCount > 0,
      isFullySelected: selectedCount === m.ways,
      riskLevel: m.riskLevel,
    };
  });

  const getBarColor = (entry: (typeof data)[0]) => {
    if (entry.isSelected) return "hsl(var(--primary))";
    switch (entry.riskLevel) {
      case "low":
        return "hsl(142, 76%, 36%)";
      case "medium":
        return "hsl(48, 96%, 53%)";
      case "high":
        return "hsl(25, 95%, 53%)";
      case "extreme":
        return "hsl(0, 84%, 60%)";
      default:
        return "hsl(var(--muted-foreground))";
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4" />
          Probability Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48 min-w-0">
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
              <BarChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                <XAxis
                  dataKey="sum"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const data = payload[0].payload;
                    return (
                      <div className="bg-popover border rounded-lg p-3 shadow-lg">
                        <div className="font-bold">Sum of {data.sum}</div>
                        <div className="text-sm text-muted-foreground">
                          {data.ways}/36 combinations
                        </div>
                        <div className="text-sm">
                          Probability: {data.probability.toFixed(2)}%
                        </div>
                        <div className="text-sm font-mono">
                          Multiplier: {data.multiplier}x
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="probability" radius={[4, 4, 0, 0]}>
                  {data.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={getBarColor(entry)}
                      opacity={entry.isSelected ? 1 : 0.7}
                      stroke={entry.isSelected ? "hsl(var(--primary))" : "none"}
                      strokeWidth={entry.isSelected ? 2 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-4 justify-center text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-green-500" />
            <span>Low Risk</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-yellow-500" />
            <span>Medium</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-orange-500" />
            <span>High</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-red-500" />
            <span>Extreme</span>
          </div>
        </div>

        {/* Expected Value Note */}
        <div className="mt-4 p-3 bg-secondary/50 rounded-lg text-center text-sm text-muted-foreground">
          All predictions have equal expected value (EV = base reward)
        </div>
      </CardContent>
    </Card>
  );
}
