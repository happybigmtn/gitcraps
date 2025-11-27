"use client";

import { useState, useCallback } from 'react';

export interface SimulationState {
  isRunning: boolean;
  currentRound: number;
  totalRounds: number;
  error: string | null;
}

export interface SimulationControls {
  start: () => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Hook for managing simulation engine state
 * Extracted from BotLeaderboard for reusability and testability
 */
export function useSimulationEngine(): SimulationState & SimulationControls {
  const [isRunning, setIsRunning] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(() => {
    setIsRunning(true);
    setError(null);
  }, []);

  const stop = useCallback(() => {
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    setIsRunning(false);
    setCurrentRound(0);
    setTotalRounds(0);
    setError(null);
  }, []);

  return {
    isRunning,
    currentRound,
    totalRounds,
    error,
    start,
    stop,
    reset,
  };
}

export default useSimulationEngine;
