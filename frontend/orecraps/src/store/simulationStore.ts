import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { squareToDice, squareToSum } from "@/lib/dice";

// Bot strategies
export type BotStrategy = "lucky7" | "field" | "random" | "doubles" | "diversified";

// Bonus bet payouts (true odds from simulation)
export const BONUS_BET_PAYOUTS = {
  5: 2,    // 5+ unique sums: 2:1 (fair: 2.39:1)
  6: 4,    // 6+ unique sums: 4:1 (fair: 4.03:1)
  7: 7,    // 7+ unique sums: 7:1 (fair: 7.31:1)
  8: 15,   // 8+ unique sums: 15:1 (fair: 15.15:1)
  9: 40,   // 9+ unique sums: 40:1 (fair: 40.68:1)
  10: 189, // 10 unique sums: 189:1 (fair: 189.40:1)
};

// Bot configuration
export interface Bot {
  id: string;
  name: string;
  pubkey: string;
  strategy: BotStrategy;
  color: string;
  rngBalance: number; // RNG tokens available
  initialRngBalance: number;
  crapEarned: number; // CRAP tokens earned this session
  lifetimeCrapEarned: number;
  deployedSquares: number[]; // indices of squares bot has bet on
  deployedAmount: number; // RNG per square
  totalDeployed: number; // total RNG deployed this round
  lifetimeDeployed: number;
  roundsPlayed: number;
  roundsWon: number;
  epochsPlayed: number;
  bonusBetsWon: number;
  bonusCrapEarned: number; // CRAP from bonus bets
}

// Epoch state - tracks progress until a 7 is rolled
export interface EpochState {
  epochNumber: number;
  roundsInEpoch: number;
  uniqueSums: Set<number>; // Unique sums 2-6, 8-12 rolled this epoch
  rollHistory: number[]; // All dice sums rolled this epoch
  bonusBetActive: boolean; // Whether bonus bet is currently active
  bonusBetMultiplier: number; // Current potential bonus multiplier (0 until 5+ unique)
}

// Simulation state
interface SimulationState {
  // Bots
  bots: Bot[];

  // Current epoch tracking
  epoch: EpochState;

  // Simulation state
  isRunning: boolean;
  isLoading: boolean;
  lastUpdate: number;
  error: string | null;

  // Round/epoch tracking
  currentRound: number;
  totalEpochs: number;
  lastWinningSquare: number | null;
  lastDiceRoll: [number, number] | null;

  // Timer sync with on-chain
  roundExpiresAt: number | null; // On-chain slot
  currentSlot: number | null;

  // Winning animation state (for 3-second flash)
  flashingWinningSquare: number | null;
  flashingWinnerBotIds: string[];

  // Actions
  initializeBots: () => void;
  startEpoch: () => void;
  placeBetsForRound: () => void;
  recordRoundResult: (winningSquare: number) => void;
  resolveEpoch: () => void; // Called when 7 is rolled
  resetBots: () => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  setOnChainState: (expiresAt: number, currentSlot: number) => void;
  clearFlash: () => void;
}

// Check if sum is 7
function isSeven(square: number): boolean {
  return squareToSum(square) === 7;
}

// Get bonus multiplier based on unique sums count
function getBonusMultiplier(uniqueCount: number): number {
  if (uniqueCount >= 10) return BONUS_BET_PAYOUTS[10];
  if (uniqueCount >= 9) return BONUS_BET_PAYOUTS[9];
  if (uniqueCount >= 8) return BONUS_BET_PAYOUTS[8];
  if (uniqueCount >= 7) return BONUS_BET_PAYOUTS[7];
  if (uniqueCount >= 6) return BONUS_BET_PAYOUTS[6];
  if (uniqueCount >= 5) return BONUS_BET_PAYOUTS[5];
  return 0;
}

// Strategy to squares mapping
const getSquaresForStrategy = (strategy: BotStrategy): number[] => {
  switch (strategy) {
    case "lucky7":
      // Sum 7: (1,6)(2,5)(3,4)(4,3)(5,2)(6,1) = indices 5, 10, 15, 20, 25, 30
      return [5, 10, 15, 20, 25, 30];
    case "field":
      // Field bets (2,3,4,9,10,11,12) - lower probability squares
      return [0, 1, 6, 4, 9, 28, 34, 35, 29]; // 2,3,4,9,10,11,12 combinations
    case "random":
      // Random single square using crypto.getRandomValues()
      const randomBytes = new Uint32Array(1);
      crypto.getRandomValues(randomBytes);
      return [randomBytes[0] % 36];
    case "doubles":
      // All doubles (1,1)(2,2)(3,3)(4,4)(5,5)(6,6)
      return [0, 7, 14, 21, 28, 35];
    case "diversified":
      // Spread across common sums (6,7,8)
      return [4, 5, 9, 10, 11, 15, 16, 20, 21];
    default:
      return [];
  }
};

// Default bot configurations - each starts with 100 RNG tokens
const DEFAULT_BOTS: Bot[] = [
  {
    id: "bot1",
    name: "Lucky7 Bot",
    pubkey: "6cHcyPWnXerjn4mpt2XAoVLzdjUGaxycyKjq945iWPov",
    strategy: "lucky7",
    color: "#22c55e", // green
    rngBalance: 100,
    initialRngBalance: 100,
    crapEarned: 0,
    lifetimeCrapEarned: 0,
    deployedSquares: [],
    deployedAmount: 0,
    totalDeployed: 0,
    lifetimeDeployed: 0,
    roundsPlayed: 0,
    roundsWon: 0,
    epochsPlayed: 0,
    bonusBetsWon: 0,
    bonusCrapEarned: 0,
  },
  {
    id: "bot2",
    name: "Field Bot",
    pubkey: "8otNdvkdZ1ruSMr4wvcxwCyEaGYMfYYFhvjdf4cQZUUx",
    strategy: "field",
    color: "#eab308", // yellow
    rngBalance: 100,
    initialRngBalance: 100,
    crapEarned: 0,
    lifetimeCrapEarned: 0,
    deployedSquares: [],
    deployedAmount: 0,
    totalDeployed: 0,
    lifetimeDeployed: 0,
    roundsPlayed: 0,
    roundsWon: 0,
    epochsPlayed: 0,
    bonusBetsWon: 0,
    bonusCrapEarned: 0,
  },
  {
    id: "bot3",
    name: "Random Bot",
    pubkey: "DE3evMLhtDRmxuq93zn7Akan93eMGcHSS2cCViABdHUV",
    strategy: "random",
    color: "#3b82f6", // blue
    rngBalance: 100,
    initialRngBalance: 100,
    crapEarned: 0,
    lifetimeCrapEarned: 0,
    deployedSquares: [],
    deployedAmount: 0,
    totalDeployed: 0,
    lifetimeDeployed: 0,
    roundsPlayed: 0,
    roundsWon: 0,
    epochsPlayed: 0,
    bonusBetsWon: 0,
    bonusCrapEarned: 0,
  },
  {
    id: "bot4",
    name: "Doubles Bot",
    pubkey: "CMWyiq8LAdDTV9LudqDDNDGggLVFBkCLtV6XoCHznm64",
    strategy: "doubles",
    color: "#f97316", // orange
    rngBalance: 100,
    initialRngBalance: 100,
    crapEarned: 0,
    lifetimeCrapEarned: 0,
    deployedSquares: [],
    deployedAmount: 0,
    totalDeployed: 0,
    lifetimeDeployed: 0,
    roundsPlayed: 0,
    roundsWon: 0,
    epochsPlayed: 0,
    bonusBetsWon: 0,
    bonusCrapEarned: 0,
  },
  {
    id: "bot5",
    name: "Diversified Bot",
    pubkey: "86dVJGw8fvmuTL7BYBxF6FCRK3xK1UdTysxhdvm25rHy",
    strategy: "diversified",
    color: "#a855f7", // purple
    rngBalance: 100,
    initialRngBalance: 100,
    crapEarned: 0,
    lifetimeCrapEarned: 0,
    deployedSquares: [],
    deployedAmount: 0,
    totalDeployed: 0,
    lifetimeDeployed: 0,
    roundsPlayed: 0,
    roundsWon: 0,
    epochsPlayed: 0,
    bonusBetsWon: 0,
    bonusCrapEarned: 0,
  },
];

// Cap roll history to prevent unbounded memory growth
const MAX_ROLL_HISTORY = 1000;

const DEFAULT_EPOCH: EpochState = {
  epochNumber: 0,
  roundsInEpoch: 0,
  uniqueSums: new Set<number>(),
  rollHistory: [],
  bonusBetActive: false,
  bonusBetMultiplier: 0,
};

export const useSimulationStore = create<SimulationState>()(
  persist(
    (set, get) => ({
  bots: DEFAULT_BOTS,
  epoch: { ...DEFAULT_EPOCH, uniqueSums: new Set() },
  isRunning: false,
  isLoading: false,
  lastUpdate: Date.now(),
  error: null,
  currentRound: 0,
  totalEpochs: 0,
  lastWinningSquare: null,
  lastDiceRoll: null,
  roundExpiresAt: null,
  currentSlot: null,
  flashingWinningSquare: null,
  flashingWinnerBotIds: [],

  initializeBots: () => {
    set({
      bots: DEFAULT_BOTS,
      epoch: { ...DEFAULT_EPOCH, uniqueSums: new Set() },
      error: null,
    });
  },

  startEpoch: () => {
    const { totalEpochs } = get();

    // Reset epoch state
    set({
      epoch: {
        epochNumber: totalEpochs + 1,
        roundsInEpoch: 0,
        uniqueSums: new Set<number>(),
        rollHistory: [],
        bonusBetActive: true,
        bonusBetMultiplier: 0,
      },
      isRunning: true,
      totalEpochs: totalEpochs + 1,
    });

    // Place initial bets
    get().placeBetsForRound();
  },

  placeBetsForRound: () => {
    const { bots, epoch } = get();

    // Each bot stakes 1 RNG per square selected
    const updatedBots = bots.map((bot) => {
      const squares = getSquaresForStrategy(bot.strategy);
      const amountPerSquare = 1;
      const totalDeployed = squares.length * amountPerSquare;

      return {
        ...bot,
        deployedSquares: squares,
        deployedAmount: amountPerSquare,
        totalDeployed,
        rngBalance: bot.rngBalance - totalDeployed,
        lifetimeDeployed: bot.lifetimeDeployed + totalDeployed,
        roundsPlayed: bot.roundsPlayed + 1,
      };
    });

    set({
      bots: updatedBots,
      epoch: {
        ...epoch,
        roundsInEpoch: epoch.roundsInEpoch + 1,
      },
      currentRound: get().currentRound + 1,
      lastUpdate: Date.now(),
    });
  },

  recordRoundResult: (winningSquare: number) => {
    const { epoch, bots } = get();
    const diceRoll = squareToDice(winningSquare);
    const sum = squareToSum(winningSquare);

    // Update unique sums (excluding 7)
    const newUniqueSums = new Set(epoch.uniqueSums);
    if (sum !== 7) {
      newUniqueSums.add(sum);
    }

    // Calculate new bonus multiplier
    const bonusMultiplier = getBonusMultiplier(newUniqueSums.size);

    // Calculate pari-mutuel pool distribution
    // Total RNG pool = all RNG staked this round by all bots
    const totalPool = bots.reduce((acc, bot) => acc + bot.totalDeployed, 0);

    // Calculate total RNG staked on the winning square by all bots
    // Each bot's stake on a square = totalDeployed / deployedSquares.length (evenly spread)
    const winningSquareStakes = bots.map((bot) => {
      if (!bot.deployedSquares.includes(winningSquare)) return 0;
      return bot.totalDeployed / bot.deployedSquares.length;
    });
    const totalWinningSquareStake = winningSquareStakes.reduce((acc, stake) => acc + stake, 0);

    // Process bets for each bot using pari-mutuel distribution
    const updatedBots = bots.map((bot, index) => {
      const won = bot.deployedSquares.includes(winningSquare);
      const botStakeOnWinningSquare = winningSquareStakes[index];

      // Pari-mutuel distribution:
      // - Winners share the entire pool proportionally to their stake on the winning square
      // - RNG refund = their share of the pool (replaces fixed refund + reward)
      // - CRAP earned = the profit portion (pool share minus original stake on winning square)
      let rngPayout = 0;
      let crapReward = 0;

      if (won && totalWinningSquareStake > 0) {
        // Winner's share of the entire pool
        const poolShare = (botStakeOnWinningSquare / totalWinningSquareStake) * totalPool;
        // RNG they get back = pool share
        rngPayout = poolShare;
        // CRAP reward = the profit (pool share - their original total stake)
        // Note: In true pari-mutuel, they lose their non-winning bets but win from the pool
        // CRAP represents the net gain from the round
        crapReward = Math.max(0, poolShare - bot.totalDeployed);
      }

      return {
        ...bot,
        rngBalance: bot.rngBalance + rngPayout,
        crapEarned: bot.crapEarned + crapReward,
        lifetimeCrapEarned: bot.lifetimeCrapEarned + crapReward,
        roundsWon: bot.roundsWon + (won ? 1 : 0),
        deployedSquares: [],
        totalDeployed: 0,
      };
    });

    // Identify winning bot IDs for flash animation
    const winningBotIds = bots
      .filter(bot => bot.deployedSquares.includes(winningSquare))
      .map(bot => bot.id);

    // Check if epoch ends (7 rolled)
    const epochEnds = isSeven(winningSquare);

    if (epochEnds) {
      // Epoch ends - process bonus bets
      const finalBots = updatedBots.map((bot) => {
        // Bonus payout based on unique sums collected
        const bonusPayout = bonusMultiplier > 0 ? bonusMultiplier : 0;
        const bonusCrap = bonusPayout > 0 ? bonusPayout : 0;

        return {
          ...bot,
          epochsPlayed: bot.epochsPlayed + 1,
          bonusBetsWon: bot.bonusBetsWon + (bonusPayout > 0 ? 1 : 0),
          bonusCrapEarned: bot.bonusCrapEarned + bonusCrap,
          crapEarned: bot.crapEarned + bonusCrap,
          lifetimeCrapEarned: bot.lifetimeCrapEarned + bonusCrap,
        };
      });

      set({
        bots: finalBots,
        epoch: {
          ...epoch,
          uniqueSums: newUniqueSums,
          rollHistory: [...epoch.rollHistory, sum].slice(-MAX_ROLL_HISTORY),
          bonusBetMultiplier: bonusMultiplier,
        },
        isRunning: false,
        lastWinningSquare: winningSquare,
        lastDiceRoll: diceRoll,
        flashingWinningSquare: winningSquare,
        flashingWinnerBotIds: winningBotIds,
      });
    } else {
      // Epoch continues - place new bets
      set({
        bots: updatedBots,
        epoch: {
          ...epoch,
          uniqueSums: newUniqueSums,
          rollHistory: [...epoch.rollHistory, sum].slice(-MAX_ROLL_HISTORY),
          bonusBetMultiplier: bonusMultiplier,
        },
        lastWinningSquare: winningSquare,
        lastDiceRoll: diceRoll,
        flashingWinningSquare: winningSquare,
        flashingWinnerBotIds: winningBotIds,
      });

      // Auto-place bets for next round
      setTimeout(() => {
        if (get().isRunning) {
          get().placeBetsForRound();
        }
      }, 100);
    }
  },

  resolveEpoch: () => {
    // Called explicitly when epoch needs to end
    set({ isRunning: false });
  },

  resetBots: () => {
    set({
      bots: DEFAULT_BOTS.map(bot => ({ ...bot })),
      epoch: { ...DEFAULT_EPOCH, uniqueSums: new Set() },
      currentRound: 0,
      totalEpochs: 0,
      lastWinningSquare: null,
      lastDiceRoll: null,
    });
  },

  setError: (error) => set({ error }),

  setLoading: (loading) => set({ isLoading: loading }),

  setOnChainState: (expiresAt, currentSlot) => {
    set({
      roundExpiresAt: expiresAt,
      currentSlot: currentSlot,
    });
  },

  clearFlash: () => {
    set({
      flashingWinningSquare: null,
      flashingWinnerBotIds: [],
    });
  },
}),
{
  name: "orecraps-simulation",
  storage: createJSONStorage(() => localStorage),
  // Handle Set serialization for uniqueSums
  partialize: (state) => ({
    bots: state.bots,
    epoch: {
      ...state.epoch,
      uniqueSums: Array.from(state.epoch.uniqueSums),
    },
    currentRound: state.currentRound,
    totalEpochs: state.totalEpochs,
    lastWinningSquare: state.lastWinningSquare,
    lastDiceRoll: state.lastDiceRoll,
  }),
  // Rehydrate: convert uniqueSums array back to Set
  onRehydrateStorage: () => (state) => {
    if (state && state.epoch && Array.isArray(state.epoch.uniqueSums)) {
      // Safe type guard: only convert if it's actually an array
      state.epoch.uniqueSums = new Set(state.epoch.uniqueSums);
    }
  },
}
));

// Selectors
export const useBotsWithBets = () =>
  useSimulationStore((state) =>
    state.bots.filter((bot) => bot.deployedSquares.length > 0)
  );

export const useTotalBotDeployed = () =>
  useSimulationStore((state) =>
    state.bots.reduce((acc, bot) => acc + bot.totalDeployed, 0)
  );

export const useEpochState = () =>
  useSimulationStore((state) => state.epoch);

// Helper function to compute bot square map (used outside of React)
export const computeBotSquareMap = (bots: Bot[]) => {
  const map: Record<number, { botId: string; color: string; name: string }[]> = {};
  bots.forEach((bot) => {
    bot.deployedSquares.forEach((square) => {
      if (!map[square]) map[square] = [];
      map[square].push({ botId: bot.id, color: bot.color, name: bot.name });
    });
  });
  return map;
};

// Get bots for use in components that need to compute derived data
export const useBots = () => useSimulationStore((state) => state.bots);

// Hook to get bot square map - returns computed map based on bots state
export const useBotSquareMap = () => {
  const bots = useSimulationStore((state) => state.bots);
  return computeBotSquareMap(bots);
};

// Hook to get time remaining in current round (synced with on-chain)
export const useTimeRemaining = () => {
  const roundExpiresAt = useSimulationStore((state) => state.roundExpiresAt);
  const currentSlot = useSimulationStore((state) => state.currentSlot);

  if (!roundExpiresAt || !currentSlot) return null;

  const slotsRemaining = roundExpiresAt - currentSlot;
  const secondsRemaining = (slotsRemaining * 400) / 1000; // 400ms per slot

  return Math.max(0, secondsRemaining);
};
