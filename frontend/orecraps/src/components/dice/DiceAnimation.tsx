"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { DICE_FACES } from "@/lib/dice";

interface DiceAnimationProps {
  die1: number;
  die2: number;
  isRolling: boolean;
  onRollComplete?: () => void;
}

function DiceFace({ value, size = 64 }: { value: number; size?: number }) {
  const dots = DICE_FACES[value] || [];

  return (
    <div
      className="dice-face bg-white dark:bg-gray-800 rounded-lg p-2 shadow-lg border-2 border-gray-200 dark:border-gray-700"
      style={{ width: size, height: size }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <div
          key={i}
          className={cn(
            "dice-dot transition-opacity",
            dots.includes(i) ? "opacity-100 bg-gray-900 dark:bg-white" : "opacity-0"
          )}
        />
      ))}
    </div>
  );
}

export function DiceAnimation({
  die1,
  die2,
  isRolling,
  onRollComplete,
}: DiceAnimationProps) {
  const [displayDie1, setDisplayDie1] = useState(die1);
  const [displayDie2, setDisplayDie2] = useState(die2);
  const [rollPhase, setRollPhase] = useState<"idle" | "rolling" | "landed">("idle");

  useEffect(() => {
    if (isRolling) {
      setRollPhase("rolling");

      // Rapid random display during roll
      const interval = setInterval(() => {
        setDisplayDie1(Math.floor(Math.random() * 6) + 1);
        setDisplayDie2(Math.floor(Math.random() * 6) + 1);
      }, 100);

      // Stop rolling and show final result
      const timeout = setTimeout(() => {
        clearInterval(interval);
        setDisplayDie1(die1);
        setDisplayDie2(die2);
        setRollPhase("landed");
        onRollComplete?.();
      }, 2000);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    } else {
      setDisplayDie1(die1);
      setDisplayDie2(die2);
      setRollPhase("idle");
    }
  }, [isRolling, die1, die2, onRollComplete]);

  const rollVariants = {
    idle: {
      rotateX: 0,
      rotateY: 0,
      scale: 1,
    },
    rolling: {
      rotateX: [0, 360, 720, 1080, 1440],
      rotateY: [0, 180, 360, 540, 720],
      scale: [1, 1.2, 1.3, 1.2, 1.1],
      transition: {
        duration: 2,
        ease: "easeInOut" as const,
      },
    },
    landed: {
      rotateX: 0,
      rotateY: 0,
      scale: 1,
      transition: {
        type: "spring" as const,
        stiffness: 300,
        damping: 20,
      },
    },
  };

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Dice Container */}
      <div className="flex items-center gap-8" style={{ perspective: "1000px" }}>
        <motion.div
          variants={rollVariants}
          animate={rollPhase}
          style={{ transformStyle: "preserve-3d" }}
        >
          <DiceFace value={displayDie1} size={80} />
        </motion.div>

        <motion.span
          className="text-3xl font-bold text-muted-foreground"
          animate={rollPhase === "rolling" ? { opacity: [1, 0.5, 1] } : {}}
          transition={{ duration: 0.3, repeat: Infinity }}
        >
          +
        </motion.span>

        <motion.div
          variants={rollVariants}
          animate={rollPhase}
          style={{ transformStyle: "preserve-3d" }}
          transition={{ delay: 0.1 }}
        >
          <DiceFace value={displayDie2} size={80} />
        </motion.div>
      </div>

      {/* Sum Display */}
      <AnimatePresence mode="wait">
        {rollPhase === "landed" && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="text-center"
          >
            <div className="text-6xl font-bold text-primary">
              {die1 + die2}
            </div>
            <div className="text-muted-foreground mt-2">
              {die1} + {die2}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rolling indicator */}
      {rollPhase === "rolling" && (
        <motion.div
          className="text-muted-foreground"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 0.5, repeat: Infinity }}
        >
          Rolling...
        </motion.div>
      )}
    </div>
  );
}

// Compact dice display for results
export function DiceResult({
  die1,
  die2,
  prediction,
  won,
}: {
  die1: number;
  die2: number;
  prediction: number;
  won: boolean;
}) {
  const sum = die1 + die2;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border-2",
        won
          ? "bg-green-500/20 border-green-500"
          : "bg-red-500/20 border-red-500"
      )}
    >
      <div className="flex items-center gap-2">
        <DiceFace value={die1} size={32} />
        <span className="text-muted-foreground">+</span>
        <DiceFace value={die2} size={32} />
      </div>
      <div className="flex-1">
        <span className="text-2xl font-bold">= {sum}</span>
      </div>
      <div className="text-right">
        {won ? (
          <span className="text-green-500 font-bold">WIN!</span>
        ) : (
          <span className="text-red-500">
            Predicted: {prediction === 0 ? "SAFE" : prediction}
          </span>
        )}
      </div>
    </motion.div>
  );
}
