"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { formatTimeRemaining, slotsToSeconds } from "@/lib/solana";
import { Clock, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface RoundTimerProps {
  roundId?: bigint;
  startSlot?: bigint;
  endSlot?: bigint;
  currentSlot?: bigint;
}

export function RoundTimer({
  roundId = 0n,
  startSlot = 0n,
  endSlot = 0n,
  currentSlot = 0n,
}: RoundTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(0);
  const lastSlotUpdateRef = useRef<number>(Date.now());
  const baseTimeRef = useRef<number>(0);

  useEffect(() => {
    if (endSlot && currentSlot) {
      const slotsRemaining = Number(endSlot > currentSlot ? endSlot - currentSlot : 0n);
      const newTime = slotsToSeconds(slotsRemaining);
      baseTimeRef.current = newTime;
      lastSlotUpdateRef.current = Date.now();
      setTimeRemaining(newTime);
    }
  }, [endSlot, currentSlot]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (baseTimeRef.current <= 0) return;
      const elapsedSinceUpdate = (Date.now() - lastSlotUpdateRef.current) / 1000;
      const estimatedRemaining = Math.max(0, baseTimeRef.current - elapsedSinceUpdate);
      setTimeRemaining(estimatedRemaining);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const isActive = timeRemaining > 0;
  const isUrgent = timeRemaining > 0 && timeRemaining <= 10;
  const isCritical = timeRemaining > 0 && timeRemaining <= 5;

  const totalSlots = Number(endSlot - startSlot);
  const elapsedSlots = Number(currentSlot - startSlot);
  const progress = totalSlots > 0 ? Math.min(100, (elapsedSlots / totalSlots) * 100) : 0;

  return (
    <Card className={cn(
      "overflow-hidden border-border/50",
      isCritical && "border-[oklch(0.65_0.25_25)]"
    )}>
      <CardContent className="p-0">
        {/* MSCHF-style compact header */}
        <div className="flex items-stretch">
          {/* Round ID - Left accent panel */}
          <div className={cn(
            "flex flex-col items-center justify-center px-4 py-3 border-r border-border/30",
            isActive ? "bg-primary/10 border-l-3 border-l-primary" : "bg-secondary/30"
          )}>
            <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
              EPOCH
            </span>
            <span className="font-mono font-bold text-xl text-foreground">
              {roundId.toString().padStart(3, '0')}
            </span>
          </div>

          {/* Timer - Central display */}
          <div className="flex-1 flex items-center justify-center py-3 px-4">
            {isActive ? (
              <div className="flex items-center gap-3">
                <motion.div
                  animate={isCritical ? { scale: [1, 1.1, 1] } : {}}
                  transition={{ duration: 0.5, repeat: Infinity }}
                >
                  <Clock className={cn(
                    "h-4 w-4",
                    isCritical ? "text-[oklch(0.65_0.25_25)]" : "text-muted-foreground"
                  )} />
                </motion.div>
                <div className={cn(
                  "font-mono text-3xl font-bold tabular-nums tracking-tight",
                  isCritical ? "text-[oklch(0.65_0.25_25)]" : isUrgent ? "text-primary" : "text-foreground"
                )}>
                  {formatTimeRemaining(timeRemaining)}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground/50" />
                <span className="font-mono text-sm text-muted-foreground">
                  AWAITING NEXT EPOCH
                </span>
              </div>
            )}
          </div>

          {/* Status indicator - Right panel */}
          <div className={cn(
            "flex flex-col items-center justify-center px-4 py-3 border-l border-border/30",
            isActive ? "bg-[oklch(0.75_0.2_145/0.1)]" : "bg-secondary/30"
          )}>
            <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
              STATUS
            </span>
            <span className={cn(
              "font-mono font-bold text-xs",
              isActive ? "text-[oklch(0.75_0.2_145)]" : "text-muted-foreground"
            )}>
              {isActive ? "LIVE" : "IDLE"}
            </span>
          </div>
        </div>

        {/* Progress bar - MSCHF style thin line */}
        <div className="h-1 bg-secondary/50">
          <motion.div
            className={cn(
              "h-full",
              isCritical
                ? "bg-[oklch(0.65_0.25_25)]"
                : isUrgent
                ? "bg-primary"
                : "bg-[oklch(0.75_0.2_145)]"
            )}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          />
        </div>

        {/* Footer stats - Technical info */}
        {isActive && (
          <div className="px-4 py-1.5 bg-secondary/20 flex items-center justify-between text-[9px] font-mono text-muted-foreground">
            <span>
              SLOT {Number(currentSlot).toLocaleString()} / {Number(endSlot).toLocaleString()}
            </span>
            <span>
              {progress.toFixed(1)}% ELAPSED
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
