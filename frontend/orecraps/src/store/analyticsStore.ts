"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface EpochResult {
  epochNumber: number;
  rounds: number;
  uniqueSums: number[];
  rollHistory: number[];
  bonusMultiplier: number;
  timestamp: number;
  totalRngStaked: number;
  totalCrapEarned: number;
  totalBonusCrap: number;
  winningSquares: number[];
  botResults: {
    botId: string;
    name: string;
    rngSpent: number;
    crapEarned: number;
    bonusCrapEarned: number;
    roundsPlayed: number;
    roundsWon: number;
    strategy: string;
  }[];
}

export interface SimulationSession {
  id: string;
  network: "localnet" | "devnet";
  startTime: number;
  endTime: number | null;
  epochs: EpochResult[];
  totalEpochs: number;
  status: "running" | "completed" | "failed";
  programId: string;
}

interface AnalyticsState {
  sessions: SimulationSession[];
  currentSession: SimulationSession | null;

  // Actions
  startSession: (network: "localnet" | "devnet", programId: string, totalEpochs: number) => string;
  recordEpoch: (epochResult: EpochResult) => void;
  endSession: (status: "completed" | "failed") => void;
  clearSessions: () => void;

  // Computed analytics
  getAggregateStats: () => {
    totalEpochs: number;
    totalRounds: number;
    totalRngStaked: number;
    totalCrapEarned: number;
    avgRoundsPerEpoch: number;
    bonusHitRate: number;
    sumDistribution: Record<number, number>;
    strategyPerformance: Record<string, { rngSpent: number; crapEarned: number; roi: number }>;
  };
}

export const useAnalyticsStore = create<AnalyticsState>()(
  persist(
    (set, get) => ({
      sessions: [],
      currentSession: null,

      startSession: (network, programId, totalEpochs) => {
        // Use crypto for secure session ID generation
        const randomBytes = new Uint32Array(2);
        crypto.getRandomValues(randomBytes);
        const id = `session-${Date.now()}-${randomBytes[0].toString(36)}${randomBytes[1].toString(36)}`;
        const session: SimulationSession = {
          id,
          network,
          startTime: Date.now(),
          endTime: null,
          epochs: [],
          totalEpochs,
          status: "running",
          programId,
        };
        set({ currentSession: session });
        return id;
      },

      recordEpoch: (epochResult) => {
        const { currentSession } = get();
        if (!currentSession) return;

        const updatedSession = {
          ...currentSession,
          epochs: [...currentSession.epochs, epochResult],
        };
        set({ currentSession: updatedSession });
      },

      endSession: (status) => {
        const { currentSession, sessions } = get();
        if (!currentSession) return;

        const completedSession = {
          ...currentSession,
          endTime: Date.now(),
          status,
        };
        set({
          currentSession: null,
          sessions: [...sessions, completedSession],
        });
      },

      clearSessions: () => set({ sessions: [], currentSession: null }),

      getAggregateStats: () => {
        const { sessions, currentSession } = get();
        const allSessions = currentSession
          ? [...sessions, currentSession]
          : sessions;

        const allEpochs = allSessions.flatMap((s) => s.epochs);

        if (allEpochs.length === 0) {
          return {
            totalEpochs: 0,
            totalRounds: 0,
            totalRngStaked: 0,
            totalCrapEarned: 0,
            avgRoundsPerEpoch: 0,
            bonusHitRate: 0,
            sumDistribution: {},
            strategyPerformance: {},
          };
        }

        const totalRounds = allEpochs.reduce((acc, e) => acc + e.rounds, 0);
        const totalRngStaked = allEpochs.reduce((acc, e) => acc + e.totalRngStaked, 0);
        const totalCrapEarned = allEpochs.reduce((acc, e) => acc + e.totalCrapEarned + e.totalBonusCrap, 0);
        const bonusHits = allEpochs.filter((e) => e.bonusMultiplier > 0).length;

        // Sum distribution
        const sumDistribution: Record<number, number> = {};
        allEpochs.forEach((e) => {
          e.rollHistory.forEach((sum) => {
            sumDistribution[sum] = (sumDistribution[sum] || 0) + 1;
          });
        });

        // Strategy performance
        const strategyPerformance: Record<string, { rngSpent: number; crapEarned: number; roi: number }> = {};
        allEpochs.forEach((e) => {
          e.botResults.forEach((bot) => {
            if (!strategyPerformance[bot.strategy]) {
              strategyPerformance[bot.strategy] = { rngSpent: 0, crapEarned: 0, roi: 0 };
            }
            strategyPerformance[bot.strategy].rngSpent += bot.rngSpent;
            strategyPerformance[bot.strategy].crapEarned += bot.crapEarned + bot.bonusCrapEarned;
          });
        });
        // Calculate ROI
        Object.keys(strategyPerformance).forEach((strategy) => {
          const s = strategyPerformance[strategy];
          s.roi = s.rngSpent > 0 ? ((s.crapEarned - s.rngSpent) / s.rngSpent) * 100 : 0;
        });

        return {
          totalEpochs: allEpochs.length,
          totalRounds,
          totalRngStaked,
          totalCrapEarned,
          avgRoundsPerEpoch: totalRounds / allEpochs.length,
          bonusHitRate: (bonusHits / allEpochs.length) * 100,
          sumDistribution,
          strategyPerformance,
        };
      },
    }),
    {
      name: "orecraps-analytics",
      partialize: (state) => ({
        sessions: state.sessions,
      }),
    }
  )
);
