"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTimeRemaining, slotsToSeconds } from "@/lib/solana";
import { Clock, Play, Pause } from "lucide-react";

interface RoundTimerProps {
  roundId?: number;
  startSlot?: number;
  endSlot?: number;
  currentSlot?: number;
}

export function RoundTimer({
  roundId = 0,
  startSlot = 0,
  endSlot = 0,
  currentSlot = 0,
}: RoundTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(0);

  // Calculate time remaining
  useEffect(() => {
    if (endSlot && currentSlot) {
      const slotsRemaining = Math.max(0, endSlot - currentSlot);
      setTimeRemaining(slotsToSeconds(slotsRemaining));
    }
  }, [endSlot, currentSlot]);

  // Countdown timer
  useEffect(() => {
    if (timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [timeRemaining]);

  const isActive = timeRemaining > 0;
  const isUrgent = timeRemaining > 0 && timeRemaining <= 10;

  // Progress percentage
  const totalSlots = endSlot - startSlot;
  const elapsedSlots = currentSlot - startSlot;
  const progress = totalSlots > 0 ? Math.min(100, (elapsedSlots / totalSlots) * 100) : 0;

  return (
    <Card className={isUrgent ? "border-destructive" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          {/* Round Info */}
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-full ${
                isActive ? "bg-green-500/20" : "bg-muted"
              }`}
            >
              {isActive ? (
                <Play className="h-4 w-4 text-green-500" />
              ) : (
                <Pause className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Round</div>
              <div className="font-mono font-bold text-lg">#{roundId}</div>
            </div>
          </div>

          {/* Timer */}
          <div className="text-right">
            <div className="text-sm text-muted-foreground flex items-center gap-1 justify-end">
              <Clock className="h-3 w-3" />
              Time Remaining
            </div>
            <motion.div
              className={`font-mono text-3xl font-bold ${
                isUrgent ? "text-destructive" : ""
              }`}
              animate={isUrgent ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 0.5, repeat: Infinity }}
            >
              {formatTimeRemaining(timeRemaining)}
            </motion.div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <motion.div
              className={`h-full ${isUrgent ? "bg-destructive" : "bg-primary"}`}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        {/* Status Badge */}
        <div className="mt-3 flex justify-center">
          {isActive ? (
            <Badge
              variant="secondary"
              className={isUrgent ? "bg-destructive/20 text-destructive" : ""}
            >
              {isUrgent ? "Closing Soon!" : "Round Active"}
            </Badge>
          ) : (
            <Badge variant="outline">Waiting for Next Round</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
