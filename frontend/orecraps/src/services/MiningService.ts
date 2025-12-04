/**
 * Mining Service - Simulates multi-token mining rewards distribution
 * 
 * Miners stake RNG on dice outcomes and receive proportional shares of ALL game tokens:
 * - CRAP (Craps), CARAT (Baccarat), BJ (Blackjack), ROUL (Roulette)
 * - WAR (Casino War), SICO (Sic Bo), TCP (Three Card Poker), VPK (Video Poker), UTH (Ultimate Texas Hold'em)
 * 
 * Token distribution is proportional to the miner's stake in winning squares.
 */

import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import {
  RNG_MINT,
  CRAP_MINT,
  CARAT_MINT,
  BJ_MINT,
  ROUL_MINT,
  WAR_MINT,
  SICO_MINT,
  TCP_MINT,
  VPK_MINT,
  UTH_MINT,
  ONE_RNG,
} from "@/lib/solana";

// Game token mints for distribution
export const GAME_TOKEN_MINTS = {
  CRAP: CRAP_MINT,
  CARAT: CARAT_MINT,
  BJ: BJ_MINT,
  ROUL: ROUL_MINT,
  WAR: WAR_MINT,
  SICO: SICO_MINT,
  TCP: TCP_MINT,
  VPK: VPK_MINT,
  UTH: UTH_MINT,
} as const;

export type GameTokenMintKey = keyof typeof GAME_TOKEN_MINTS;

// Mining round state
export interface MiningRound {
  roundId: number;
  totalDeployed: bigint;
  deployedBySquare: bigint[];
  minerDeployments: Map<string, MinerDeployment>;
  winningSquare: number | null;
  diceResult: [number, number] | null;
  isSettled: boolean;
  rewards: TokenRewards;
}

// Individual miner's deployment in a round
export interface MinerDeployment {
  address: string;
  deployedBySquare: bigint[];
  totalDeployed: bigint;
  dicePrediction: number;
  pendingRewards: TokenRewards;
  claimedRewards: TokenRewards;
}

// Token rewards structure (all 9 game tokens)
export interface TokenRewards {
  CRAP: bigint;
  CARAT: bigint;
  BJ: bigint;
  ROUL: bigint;
  WAR: bigint;
  SICO: bigint;
  TCP: bigint;
  VPK: bigint;
  UTH: bigint;
}

// Create empty rewards structure
function emptyRewards(): TokenRewards {
  return {
    CRAP: 0n,
    CARAT: 0n,
    BJ: 0n,
    ROUL: 0n,
    WAR: 0n,
    SICO: 0n,
    TCP: 0n,
    VPK: 0n,
    UTH: 0n,
  };
}

// Mining configuration
export const MINING_CONFIG = {
  BOARD_SIZE: 36,
  BASE_REWARD_PER_ROUND: ONE_RNG, // 1 token base reward per game type per round
  DICE_PREDICTION_MULTIPLIER: 2n, // 2x rewards for correct dice prediction
  VAULT_PERCENTAGE: 10n, // 10% goes to vault/treasury
  ADMIN_FEE_PERCENTAGE: 1n, // 1% admin fee
};

export class MiningService {
  private connection: Connection;
  private currentRound: MiningRound;
  private roundHistory: MiningRound[] = [];

  constructor(connection: Connection) {
    this.connection = connection;
    this.currentRound = this.createNewRound(1);
  }

  private createNewRound(roundId: number): MiningRound {
    return {
      roundId,
      totalDeployed: 0n,
      deployedBySquare: Array(MINING_CONFIG.BOARD_SIZE).fill(0n),
      minerDeployments: new Map(),
      winningSquare: null,
      diceResult: null,
      isSettled: false,
      rewards: emptyRewards(),
    };
  }

  /**
   * Deploy RNG tokens to specified squares
   */
  deploy(
    minerAddress: string,
    squareMask: bigint,
    amountPerSquare: bigint,
    dicePrediction: number = 0
  ): { success: boolean; totalDeployed: bigint; squaresDeployed: number; error?: string } {
    if (this.currentRound.isSettled) {
      return { success: false, totalDeployed: 0n, squaresDeployed: 0, error: "Round already settled" };
    }

    if (dicePrediction !== 0 && (dicePrediction < 2 || dicePrediction > 12)) {
      return { success: false, totalDeployed: 0n, squaresDeployed: 0, error: "Invalid dice prediction" };
    }

    // Get or create miner deployment
    let minerDeploy = this.currentRound.minerDeployments.get(minerAddress);
    if (!minerDeploy) {
      minerDeploy = {
        address: minerAddress,
        deployedBySquare: Array(MINING_CONFIG.BOARD_SIZE).fill(0n) as bigint[],
        totalDeployed: 0n,
        dicePrediction,
        pendingRewards: emptyRewards(),
        claimedRewards: emptyRewards(),
      };
      this.currentRound.minerDeployments.set(minerAddress, minerDeploy);
    }

    // Update dice prediction
    minerDeploy.dicePrediction = dicePrediction;

    // Deploy to each square in the mask
    let totalDeployed = 0n;
    let squaresDeployed = 0;

    for (let i = 0; i < MINING_CONFIG.BOARD_SIZE; i++) {
      if ((squareMask & (1n << BigInt(i))) !== 0n) {
        // Skip if already deployed to this square
        if (minerDeploy.deployedBySquare[i] > 0n) continue;

        minerDeploy.deployedBySquare[i] = amountPerSquare;
        minerDeploy.totalDeployed += amountPerSquare;
        this.currentRound.deployedBySquare[i] += amountPerSquare;
        this.currentRound.totalDeployed += amountPerSquare;
        totalDeployed += amountPerSquare;
        squaresDeployed++;
      }
    }

    return { success: true, totalDeployed, squaresDeployed };
  }

  /**
   * Settle the current round with dice results
   */
  settleRound(die1: number, die2: number): {
    success: boolean;
    winningSquare: number;
    totalWinners: number;
    rewards: TokenRewards;
    error?: string;
  } {
    if (this.currentRound.isSettled) {
      return {
        success: false,
        winningSquare: -1,
        totalWinners: 0,
        rewards: emptyRewards(),
        error: "Round already settled",
      };
    }

    if (die1 < 1 || die1 > 6 || die2 < 1 || die2 > 6) {
      return {
        success: false,
        winningSquare: -1,
        totalWinners: 0,
        rewards: emptyRewards(),
        error: "Invalid dice values",
      };
    }

    this.currentRound.diceResult = [die1, die2];
    const diceSum = die1 + die2;
    
    // Calculate winning square (simplified: (die1-1) * 6 + (die2-1))
    const winningSquare = (die1 - 1) * 6 + (die2 - 1);
    this.currentRound.winningSquare = winningSquare;

    // Calculate total rewards for each game token
    // Base reward = 1 token per game type, split among winners
    const baseRewardPerToken = MINING_CONFIG.BASE_REWARD_PER_ROUND;
    
    // Calculate rewards for each game token
    const roundRewards = emptyRewards();
    const winningSquareDeployed = this.currentRound.deployedBySquare[winningSquare];
    
    if (winningSquareDeployed > 0n) {
      // Distribute rewards proportionally to winners
      let totalWinners = 0;
      
      for (const [address, miner] of this.currentRound.minerDeployments) {
        if (miner.deployedBySquare[winningSquare] > 0n) {
          totalWinners++;
          
          // Calculate share (miner's deployment / total winning deployment)
          const shareNumerator = miner.deployedBySquare[winningSquare] * 10000n;
          const sharePercentage = shareNumerator / winningSquareDeployed;
          
          // Calculate dice prediction bonus
          const predictionBonus = miner.dicePrediction === diceSum 
            ? MINING_CONFIG.DICE_PREDICTION_MULTIPLIER 
            : 1n;
          
          // Distribute all game tokens proportionally
          for (const token of Object.keys(GAME_TOKEN_MINTS) as GameTokenMintKey[]) {
            const tokenReward = (baseRewardPerToken * sharePercentage * predictionBonus) / 10000n;
            miner.pendingRewards[token] += tokenReward;
            roundRewards[token] += tokenReward;
          }
        }
      }

      this.currentRound.rewards = roundRewards;
      this.currentRound.isSettled = true;

      // Store in history and create new round
      this.roundHistory.push(this.currentRound);
      const nextRoundId = this.currentRound.roundId + 1;
      this.currentRound = this.createNewRound(nextRoundId);

      return {
        success: true,
        winningSquare,
        totalWinners,
        rewards: roundRewards,
      };
    } else {
      // No winners - vault all deployed
      this.currentRound.isSettled = true;
      this.roundHistory.push(this.currentRound);
      const nextRoundId = this.currentRound.roundId + 1;
      this.currentRound = this.createNewRound(nextRoundId);

      return {
        success: true,
        winningSquare,
        totalWinners: 0,
        rewards: emptyRewards(),
      };
    }
  }

  /**
   * Claim pending rewards for a miner
   */
  claimRewards(minerAddress: string): {
    success: boolean;
    rewards: TokenRewards;
    error?: string;
  } {
    // Aggregate rewards from all settled rounds
    const totalRewards = emptyRewards();
    
    for (const round of this.roundHistory) {
      const miner = round.minerDeployments.get(minerAddress);
      if (miner) {
        for (const token of Object.keys(GAME_TOKEN_MINTS) as GameTokenMintKey[]) {
          const pending = miner.pendingRewards[token] - miner.claimedRewards[token];
          if (pending > 0n) {
            totalRewards[token] += pending;
            miner.claimedRewards[token] = miner.pendingRewards[token];
          }
        }
      }
    }

    return { success: true, rewards: totalRewards };
  }

  /**
   * Get current round state
   */
  getCurrentRound(): MiningRound {
    return { ...this.currentRound };
  }

  /**
   * Get round history
   */
  getRoundHistory(): MiningRound[] {
    return [...this.roundHistory];
  }

  /**
   * Get miner stats across all rounds
   */
  getMinerStats(minerAddress: string): {
    totalDeployed: bigint;
    totalWins: number;
    totalRewardsEarned: TokenRewards;
    pendingRewards: TokenRewards;
  } {
    let totalDeployed = 0n;
    let totalWins = 0;
    const totalRewardsEarned = emptyRewards();
    const pendingRewards = emptyRewards();

    for (const round of this.roundHistory) {
      const miner = round.minerDeployments.get(minerAddress);
      if (miner) {
        totalDeployed += miner.totalDeployed;
        
        if (round.winningSquare !== null && miner.deployedBySquare[round.winningSquare] > 0n) {
          totalWins++;
        }

        for (const token of Object.keys(GAME_TOKEN_MINTS) as GameTokenMintKey[]) {
          totalRewardsEarned[token] += miner.pendingRewards[token];
          const pending = miner.pendingRewards[token] - miner.claimedRewards[token];
          if (pending > 0n) {
            pendingRewards[token] += pending;
          }
        }
      }
    }

    // Add current round deployment
    const currentMiner = this.currentRound.minerDeployments.get(minerAddress);
    if (currentMiner) {
      totalDeployed += currentMiner.totalDeployed;
    }

    return { totalDeployed, totalWins, totalRewardsEarned, pendingRewards };
  }

  /**
   * Get global mining statistics
   */
  getGlobalStats(): {
    totalRounds: number;
    totalDeployed: bigint;
    totalRewardsDistributed: TokenRewards;
    uniqueMiners: number;
  } {
    let totalDeployed = 0n;
    const totalRewardsDistributed = emptyRewards();
    const uniqueMiners = new Set<string>();

    for (const round of this.roundHistory) {
      totalDeployed += round.totalDeployed;
      
      for (const token of Object.keys(GAME_TOKEN_MINTS) as GameTokenMintKey[]) {
        totalRewardsDistributed[token] += round.rewards[token];
      }

      for (const address of round.minerDeployments.keys()) {
        uniqueMiners.add(address);
      }
    }

    // Add current round
    totalDeployed += this.currentRound.totalDeployed;
    for (const address of this.currentRound.minerDeployments.keys()) {
      uniqueMiners.add(address);
    }

    return {
      totalRounds: this.roundHistory.length,
      totalDeployed,
      totalRewardsDistributed,
      uniqueMiners: uniqueMiners.size,
    };
  }
}

// Singleton instance
let miningInstance: MiningService | null = null;

export function getMiningService(connection: Connection): MiningService {
  if (!miningInstance) {
    miningInstance = new MiningService(connection);
  }
  return miningInstance;
}

// Helper: Format token rewards for display
export function formatTokenRewards(rewards: TokenRewards): Record<string, string> {
  const formatted: Record<string, string> = {};
  for (const [token, amount] of Object.entries(rewards)) {
    formatted[token] = (Number(amount) / Number(ONE_RNG)).toFixed(4);
  }
  return formatted;
}
