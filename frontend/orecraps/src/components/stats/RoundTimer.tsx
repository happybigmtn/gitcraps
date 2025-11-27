"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { formatTimeRemaining, slotsToSeconds } from "@/lib/solana";
import { Clock } from "lucide-react";

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
  const lastSlotUpdateRef = useRef<number>(Date.now());
  const baseTimeRef = useRef<number>(0);

  // Sync with on-chain state when currentSlot changes
  useEffect(() => {
    if (endSlot && currentSlot) {
      const slotsRemaining = Math.max(0, endSlot - currentSlot);
      const newTime = slotsToSeconds(slotsRemaining);
      baseTimeRef.current = newTime;
      lastSlotUpdateRef.current = Date.now();
      setTimeRemaining(newTime);
    }
  }, [endSlot, currentSlot]);

  // Smooth countdown between slot updates - interval created only once on mount
  useEffect(() => {
    const interval = setInterval(() => {
      if (baseTimeRef.current <= 0) return;

      const elapsedSinceUpdate = (Date.now() - lastSlotUpdateRef.current) / 1000;
      const estimatedRemaining = Math.max(0, baseTimeRef.current - elapsedSinceUpdate);
      setTimeRemaining(estimatedRemaining);
    }, 100);

    return () => clearInterval(interval);
  }, []); // Empty deps - created once

  const isActive = timeRemaining > 0;
  const isUrgent = timeRemaining > 0 && timeRemaining <= 10;

  // Progress percentage
  const totalSlots = endSlot - startSlot;
  const elapsedSlots = currentSlot - startSlot;
  const progress = totalSlots > 0 ? Math.min(100, (elapsedSlots / totalSlots) * 100) : 0;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          {/* Round Info */}
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isActive ? "bg-primary/10" : "bg-muted"}`}>
              <div className={`w-2 h-2 rounded-full ${isActive ? "bg-primary animate-pulse" : "bg-muted-foreground/30"}`} />
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
            <div className={`font-mono text-3xl font-bold tabular-nums ${isUrgent ? "text-orange-500" : ""}`}>
              {formatTimeRemaining(timeRemaining)}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="h-1.5 bg-secondary/50 rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${isUrgent ? "bg-orange-500" : "bg-primary"}`}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Status - Minimal */}
        {!isActive && (
          <div className="mt-3 text-center">
            <span className="text-xs text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
              Waiting for Next Round
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
