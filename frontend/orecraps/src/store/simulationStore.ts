import { create } from "zustand";

// Bot strategies
export type BotStrategy = "lucky7" | "field" | "random" | "doubles" | "diversified";

// Bot configuration
export interface Bot {
  id: string;
  name: string;
  pubkey: string;
  strategy: BotStrategy;
  color: string;
  rngBalance: number; // RNG tokens staked (in RNG units)
  initialRngBalance: number;
  crapEarned: number; // CRAP tokens earned (in CRAP units)
  lifetimeCrapEarned: number;
  deployedSquares: number[]; // indices of squares bot has bet on
  deployedAmount: number; // in smallest RNG unit per square
  totalDeployed: number; // total RNG deployed this round
  lifetimeDeployed: number;
  lifetimeWinnings: number;
  roundsPlayed: number;
  roundsWon: number;
}

// Simulation state
interface SimulationState {
  // Bots
  bots: Bot[];

  // Simulation state
  isRunning: boolean;
  isLoading: boolean;
  lastUpdate: number;
  error: string | null;

  // Round tracking
  currentRound: number;

  // Actions
  initializeBots: () => void;
  startSimulation: () => void;
  stopSimulation: () => void;
  updateBot: (id: string, updates: Partial<Bot>) => void;
  updateBotBets: (botId: string, squares: number[], amount: number) => void;
  recordRoundResult: (winningSquare: number) => void;
  resetBots: () => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
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
      // Random single square
      return [Math.floor(Math.random() * 36)];
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
    rngBalance: 100, // 100 RNG tokens
    initialRngBalance: 100,
    crapEarned: 0,
    lifetimeCrapEarned: 0,
    deployedSquares: [],
    deployedAmount: 0,
    totalDeployed: 0,
    lifetimeDeployed: 0,
    lifetimeWinnings: 0,
    roundsPlayed: 0,
    roundsWon: 0,
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
    lifetimeWinnings: 0,
    roundsPlayed: 0,
    roundsWon: 0,
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
    lifetimeWinnings: 0,
    roundsPlayed: 0,
    roundsWon: 0,
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
    lifetimeWinnings: 0,
    roundsPlayed: 0,
    roundsWon: 0,
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
    lifetimeWinnings: 0,
    roundsPlayed: 0,
    roundsWon: 0,
  },
];

export const useSimulationStore = create<SimulationState>((set, get) => ({
  bots: DEFAULT_BOTS,
  isRunning: false,
  isLoading: false,
  lastUpdate: Date.now(),
  error: null,
  currentRound: 0,

  initializeBots: () => {
    set({ bots: DEFAULT_BOTS, error: null });
  },

  startSimulation: () => {
    const { bots } = get();

    // Place bets for each bot based on their strategy
    // Each bot stakes 1 RNG per square selected
    const updatedBots = bots.map((bot) => {
      const squares = getSquaresForStrategy(bot.strategy);
      const amountPerSquare = 1; // 1 RNG token per square
      const totalDeployed = squares.length * amountPerSquare;

      return {
        ...bot,
        deployedSquares: squares,
        deployedAmount: amountPerSquare,
        totalDeployed,
        rngBalance: bot.rngBalance - totalDeployed, // Deduct staked RNG
        lifetimeDeployed: bot.lifetimeDeployed + totalDeployed,
        roundsPlayed: bot.roundsPlayed + 1,
      };
    });

    set({
      bots: updatedBots,
      isRunning: true,
      lastUpdate: Date.now(),
      currentRound: get().currentRound + 1,
    });
  },

  stopSimulation: () => {
    set({ isRunning: false });
  },

  updateBot: (id, updates) => {
    set((state) => ({
      bots: state.bots.map((bot) =>
        bot.id === id ? { ...bot, ...updates } : bot
      ),
    }));
  },

  updateBotBets: (botId, squares, amount) => {
    set((state) => ({
      bots: state.bots.map((bot) =>
        bot.id === botId
          ? {
              ...bot,
              deployedSquares: squares,
              deployedAmount: amount,
              totalDeployed: squares.length * amount,
            }
          : bot
      ),
      lastUpdate: Date.now(),
    }));
  },

  recordRoundResult: (winningSquare) => {
    set((state) => ({
      bots: state.bots.map((bot) => {
        const won = bot.deployedSquares.includes(winningSquare);
        // Winners get their RNG back + CRAP reward based on multiplier
        // Payout: 36x the stake on the winning square
        const rngRefund = won ? bot.totalDeployed : 0; // Get RNG back if won
        const crapReward = won ? (36 / bot.deployedSquares.length) * bot.totalDeployed : 0;

        return {
          ...bot,
          rngBalance: bot.rngBalance + rngRefund, // Return RNG if won
          crapEarned: bot.crapEarned + crapReward,
          lifetimeCrapEarned: bot.lifetimeCrapEarned + crapReward,
          lifetimeWinnings: bot.lifetimeWinnings + crapReward,
          roundsWon: bot.roundsWon + (won ? 1 : 0),
          deployedSquares: [], // Reset for next round
          totalDeployed: 0,
        };
      }),
      isRunning: false,
    }));
  },

  resetBots: () => {
    set({ bots: DEFAULT_BOTS, currentRound: 0 });
  },

  setError: (error) => set({ error }),

  setLoading: (loading) => set({ isLoading: loading }),
}));

// Selectors
export const useBotsWithBets = () =>
  useSimulationStore((state) =>
    state.bots.filter((bot) => bot.deployedSquares.length > 0)
  );

export const useTotalBotDeployed = () =>
  useSimulationStore((state) =>
    state.bots.reduce((acc, bot) => acc + bot.totalDeployed, 0)
  );

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
