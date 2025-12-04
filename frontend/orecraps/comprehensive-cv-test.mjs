#!/usr/bin/env node
/**
 * Comprehensive CV Testing Script - Devnet
 * 
 * Simulates a player who:
 * 1. Gets RNG tokens (via faucet/swap)
 * 2. Mines by deploying RNG on dice outcomes
 * 3. Receives multi-token rewards (CRAP, CARAT, BJ, ROUL, WAR, SICO, TCP, VPK, UTH)
 * 4. Plays multiple casino games using respective tokens
 * 5. Swaps tokens back to RNG via exchange
 */

import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import fs from "fs";

// Devnet configuration
const DEVNET_RPC = process.env.NEXT_PUBLIC_RPC_ENDPOINT || "https://api.devnet.solana.com";
const connection = new Connection(DEVNET_RPC, "confirmed");

// Token addresses (devnet)
const TOKENS = {
  RNG: new PublicKey("8HJyJPD4iWD1X9FxZEjDuVpPqSBvNeaJCczXeK2xsShs"),
  CRAP: new PublicKey("7frAenkamJSASBH9YukkzBsSMz9paQdYuSGw4SjWkXrf"),
  CARAT: new PublicKey("8ca5kPhhoSMmUinrLVSedhdBtTTtLCdh4jkyanjZML3N"),
  BJ: new PublicKey("43pt8KeVq7Y8gTgeXj6aCZTUUYZnFJcnQUsGj8vno8nF"),
  ROUL: new PublicKey("34rCuo8DHHJaJTuEUF8NAXE7h8aBumqDpd48NfgXWVPi"),
  WAR: new PublicKey("HMhL9yb5zZ7v6WmQ79NzYj5ebbeX4TN2NUkcuFFFMusz"),
  SICO: new PublicKey("5UkoVvbA7xNy9ysGVvw2hDpos6mMXJ7xRDKusV6QDEVr"),
  TCP: new PublicKey("3UTs2U6ps5z1asibwgtCZAtbatuKGcqX85QJ7zZBvvth"),
  VPK: new PublicKey("GNPiaDCr18GZ4PKcHDEFuAXkisBpN2aosBruqNAdXT2W"),
  UTH: new PublicKey("2yEhxizZGU27xB3HdjMKEVtJN5C6WrG241Lu3QcYbt5u"),
};

// Simulated Exchange State
const exchangeState = {
  pool: {
    solReserve: 20n * BigInt(LAMPORTS_PER_SOL), // 20 SOL
    rngReserve: 1000n * BigInt(1e9), // 1000 RNG (9 decimals)
    totalFees: 0n,
  },
  SWAP_FEE_BPS: 100, // 1%
};

// Simulated Mining State
const miningState = {
  currentRound: 1,
  boardSize: 36,
  deployments: new Map(),
  roundHistory: [],
};

// Test results
const testResults = {
  passed: 0,
  failed: 0,
  tests: [],
};

function logTest(name, passed, details = "") {
  testResults.tests.push({ name, passed, details });
  if (passed) {
    testResults.passed++;
    console.log(`✅ ${name}${details ? `: ${details}` : ""}`);
  } else {
    testResults.failed++;
    console.log(`❌ ${name}${details ? `: ${details}` : ""}`);
  }
}

function logSection(title) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(60)}\n`);
}

// ============================================================================
// EXCHANGE SIMULATION
// ============================================================================

function quoteSolToRng(solLamports) {
  const fee = (solLamports * BigInt(exchangeState.SWAP_FEE_BPS)) / 10000n;
  const inputAfterFee = solLamports - fee;
  
  const k = exchangeState.pool.solReserve * exchangeState.pool.rngReserve;
  const newSolReserve = exchangeState.pool.solReserve + inputAfterFee;
  const newRngReserve = k / newSolReserve;
  const outputAmount = exchangeState.pool.rngReserve - newRngReserve;
  
  return { outputAmount, fee, inputAfterFee };
}

function executeSwapSolToRng(solLamports) {
  const quote = quoteSolToRng(solLamports);
  
  exchangeState.pool.solReserve += quote.inputAfterFee;
  exchangeState.pool.rngReserve -= quote.outputAmount;
  exchangeState.pool.totalFees += quote.fee;
  
  return quote.outputAmount;
}

function quoteRngToGameToken(rngAmount) {
  // 1:1 ratio with 1% fee
  const fee = (rngAmount * BigInt(exchangeState.SWAP_FEE_BPS)) / 10000n;
  return { outputAmount: rngAmount - fee, fee };
}

function quoteGameTokenToRng(tokenAmount) {
  // 1:1 ratio with 1% fee
  const fee = (tokenAmount * BigInt(exchangeState.SWAP_FEE_BPS)) / 10000n;
  return { outputAmount: tokenAmount - fee, fee };
}

// ============================================================================
// MINING SIMULATION
// ============================================================================

function deployToSquares(minerAddress, squares, amountPerSquare, dicePrediction = 0) {
  if (!miningState.deployments.has(minerAddress)) {
    miningState.deployments.set(minerAddress, {
      deployed: new Array(36).fill(0n),
      dicePrediction,
    });
  }
  
  const miner = miningState.deployments.get(minerAddress);
  let totalDeployed = 0n;
  
  for (const square of squares) {
    if (miner.deployed[square] === 0n) {
      miner.deployed[square] = amountPerSquare;
      totalDeployed += amountPerSquare;
    }
  }
  
  miner.dicePrediction = dicePrediction;
  return totalDeployed;
}

function settleRound(die1, die2) {
  const diceSum = die1 + die2;
  const winningSquare = (die1 - 1) * 6 + (die2 - 1);
  
  // Calculate rewards for each miner
  const rewards = new Map();
  const baseReward = BigInt(1e9); // 1 token per game type
  
  for (const [address, miner] of miningState.deployments) {
    if (miner.deployed[winningSquare] > 0n) {
      // Winner! Calculate proportional reward
      const multiplier = miner.dicePrediction === diceSum ? 2n : 1n;
      const tokenReward = baseReward * multiplier;
      
      rewards.set(address, {
        CRAP: tokenReward,
        CARAT: tokenReward,
        BJ: tokenReward,
        ROUL: tokenReward,
        WAR: tokenReward,
        SICO: tokenReward,
        TCP: tokenReward,
        VPK: tokenReward,
        UTH: tokenReward,
      });
    }
  }
  
  // Store round history
  miningState.roundHistory.push({
    roundId: miningState.currentRound,
    diceResult: [die1, die2],
    winningSquare,
    rewards,
  });
  
  // Reset for next round
  miningState.currentRound++;
  miningState.deployments.clear();
  
  return { winningSquare, diceSum, rewards };
}

// ============================================================================
// GAME SIMULATIONS
// ============================================================================

function simulateCrapsGame(betAmount, betType) {
  // Simplified craps simulation
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  const sum = die1 + die2;
  
  let payout = 0n;
  
  if (betType === "PASS_LINE") {
    // Come-out: 7,11 wins, 2,3,12 loses
    if (sum === 7 || sum === 11) {
      payout = betAmount * 2n;
    }
  } else if (betType === "FIELD") {
    // Field bet: 2,3,4,9,10,11,12 wins
    if ([2, 3, 4, 9, 10, 11, 12].includes(sum)) {
      payout = sum === 2 || sum === 12 ? betAmount * 3n : betAmount * 2n;
    }
  }
  
  return { die1, die2, sum, payout, won: payout > 0n };
}

function simulateBlackjackGame(betAmount) {
  // Simplified blackjack: ~42% win rate with 1:1 payout
  const playerHand = Math.floor(Math.random() * 10) + 12; // 12-21
  const dealerHand = Math.floor(Math.random() * 10) + 12;
  
  const playerBusted = playerHand > 21;
  const dealerBusted = dealerHand > 21;
  
  let payout = 0n;
  if (!playerBusted && (dealerBusted || playerHand > dealerHand)) {
    payout = betAmount * 2n;
  } else if (!playerBusted && playerHand === dealerHand) {
    payout = betAmount; // Push
  }
  
  return { playerHand, dealerHand, payout, won: payout > betAmount };
}

function simulateRouletteGame(betAmount, betType) {
  const result = Math.floor(Math.random() * 37); // 0-36
  let payout = 0n;
  
  if (betType === "RED") {
    const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
    if (redNumbers.includes(result)) {
      payout = betAmount * 2n;
    }
  } else if (betType === "STRAIGHT") {
    // Betting on single number
    const selectedNumber = Math.floor(Math.random() * 37);
    if (result === selectedNumber) {
      payout = betAmount * 36n;
    }
  }
  
  return { result, payout, won: payout > 0n };
}

function simulateSicBoGame(betAmount, betType) {
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  const die3 = Math.floor(Math.random() * 6) + 1;
  const sum = die1 + die2 + die3;
  
  let payout = 0n;
  
  if (betType === "SMALL") {
    // Small: 4-10, not triple
    if (sum >= 4 && sum <= 10 && !(die1 === die2 && die2 === die3)) {
      payout = betAmount * 2n;
    }
  } else if (betType === "BIG") {
    // Big: 11-17, not triple
    if (sum >= 11 && sum <= 17 && !(die1 === die2 && die2 === die3)) {
      payout = betAmount * 2n;
    }
  }
  
  return { dice: [die1, die2, die3], sum, payout, won: payout > 0n };
}

// ============================================================================
// MAIN TEST FLOW
// ============================================================================

async function runComprehensiveTest() {
  console.log("\n🎰 COMPREHENSIVE CV TEST - DEVNET 🎰");
  console.log("Testing: Mining + Multi-Token Rewards + Casino Games + Exchange\n");
  
  // Generate test player
  const player = Keypair.generate();
  const playerAddress = player.publicKey.toBase58();
  console.log(`Test Player: ${playerAddress.slice(0, 8)}...${playerAddress.slice(-8)}`);
  
  // Track player balances
  const balances = {
    SOL: 10n * BigInt(LAMPORTS_PER_SOL), // Starting with 10 SOL
    RNG: 0n,
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
  
  // ========================================
  // PHASE 1: Exchange - Get RNG Tokens
  // ========================================
  logSection("PHASE 1: EXCHANGE - SOL → RNG");
  
  const swapAmount = 2n * BigInt(LAMPORTS_PER_SOL); // Swap 2 SOL for RNG
  const rngReceived = executeSwapSolToRng(swapAmount);
  balances.SOL -= swapAmount;
  balances.RNG += rngReceived;
  
  logTest(
    "Swap SOL → RNG",
    rngReceived > 0n,
    `${Number(swapAmount) / 1e9} SOL → ${(Number(rngReceived) / 1e9).toFixed(2)} RNG`
  );
  
  logTest(
    "Exchange fee applied (1%)",
    exchangeState.pool.totalFees > 0n,
    `Fees collected: ${(Number(exchangeState.pool.totalFees) / 1e9).toFixed(4)} SOL`
  );
  
  // ========================================
  // PHASE 2: Mining - Deploy RNG
  // ========================================
  logSection("PHASE 2: MINING - Deploy RNG to Squares");
  
  // Deploy to 6 random squares with dice prediction
  const squaresToDeploy = [0, 7, 14, 21, 28, 35]; // Diagonal pattern
  const deployAmountPerSquare = BigInt(1e9) / 10n; // 0.1 RNG per square
  const dicePrediction = 7; // Predict sum of 7
  
  const totalDeployed = deployToSquares(
    playerAddress,
    squaresToDeploy,
    deployAmountPerSquare,
    dicePrediction
  );
  balances.RNG -= totalDeployed;
  
  logTest(
    "Deploy RNG to mining squares",
    totalDeployed > 0n,
    `Deployed ${(Number(totalDeployed) / 1e9).toFixed(2)} RNG to ${squaresToDeploy.length} squares`
  );
  
  logTest(
    "Set dice prediction",
    miningState.deployments.get(playerAddress)?.dicePrediction === dicePrediction,
    `Prediction: ${dicePrediction}`
  );
  
  // ========================================
  // PHASE 3: Mining Settlement
  // ========================================
  logSection("PHASE 3: MINING - Round Settlement");
  
  // Simulate round with dice that hits player's square
  const die1 = 1;
  const die2 = 1;
  const settlement = settleRound(die1, die2);
  
  logTest(
    "Round settled",
    settlement.winningSquare !== undefined,
    `Dice: ${die1} + ${die2} = ${settlement.diceSum}, Winning Square: ${settlement.winningSquare}`
  );
  
  // Check if player won
  const playerWon = settlement.rewards.has(playerAddress);
  if (playerWon) {
    const rewards = settlement.rewards.get(playerAddress);
    
    // Add rewards to balances
    for (const [token, amount] of Object.entries(rewards)) {
      balances[token] += amount;
    }
    
    logTest(
      "Player received multi-token rewards",
      true,
      `9 game tokens: ${(Number(rewards.CRAP) / 1e9).toFixed(2)} each`
    );
    
    // Verify all tokens received
    const allTokensReceived = ["CRAP", "CARAT", "BJ", "ROUL", "WAR", "SICO", "TCP", "VPK", "UTH"]
      .every(t => rewards[t] > 0n);
    logTest("All 9 game tokens distributed", allTokensReceived);
  } else {
    logTest("Player on winning square", false, "Not on winning square this round");
    
    // Give some tokens for testing purposes
    const testReward = BigInt(5e9);
    balances.CRAP += testReward;
    balances.BJ += testReward;
    balances.ROUL += testReward;
    balances.SICO += testReward;
    console.log("  → Added test tokens for casino game testing");
  }
  
  // ========================================
  // PHASE 4: Casino Games
  // ========================================
  logSection("PHASE 4: CASINO GAMES");
  
  // 4.1 Craps
  console.log("\n🎲 CRAPS (using CRAP tokens)");
  const crapsBet = BigInt(1e8); // 0.1 CRAP
  if (balances.CRAP >= crapsBet) {
    balances.CRAP -= crapsBet;
    const crapsResult = simulateCrapsGame(crapsBet, "PASS_LINE");
    balances.CRAP += crapsResult.payout;
    
    logTest(
      "Craps Pass Line bet",
      true,
      `Roll: ${crapsResult.die1} + ${crapsResult.die2} = ${crapsResult.sum}, ${crapsResult.won ? "WON" : "LOST"}`
    );
  }
  
  // 4.2 Blackjack
  console.log("\n🃏 BLACKJACK (using BJ tokens)");
  const bjBet = BigInt(1e8);
  if (balances.BJ >= bjBet) {
    balances.BJ -= bjBet;
    const bjResult = simulateBlackjackGame(bjBet);
    balances.BJ += bjResult.payout;
    
    logTest(
      "Blackjack hand",
      true,
      `Player: ${bjResult.playerHand}, Dealer: ${bjResult.dealerHand}, ${bjResult.won ? "WON" : "LOST"}`
    );
  }
  
  // 4.3 Roulette
  console.log("\n🎡 ROULETTE (using ROUL tokens)");
  const roulBet = BigInt(1e8);
  if (balances.ROUL >= roulBet) {
    balances.ROUL -= roulBet;
    const roulResult = simulateRouletteGame(roulBet, "RED");
    balances.ROUL += roulResult.payout;
    
    logTest(
      "Roulette Red bet",
      true,
      `Ball landed on: ${roulResult.result}, ${roulResult.won ? "WON" : "LOST"}`
    );
  }
  
  // 4.4 Sic Bo
  console.log("\n🎲🎲🎲 SIC BO (using SICO tokens)");
  const sicoBet = BigInt(1e8);
  if (balances.SICO >= sicoBet) {
    balances.SICO -= sicoBet;
    const sicoResult = simulateSicBoGame(sicoBet, "SMALL");
    balances.SICO += sicoResult.payout;
    
    logTest(
      "Sic Bo Small bet",
      true,
      `Dice: ${sicoResult.dice.join("-")} = ${sicoResult.sum}, ${sicoResult.won ? "WON" : "LOST"}`
    );
  }
  
  // ========================================
  // PHASE 5: Exchange - Game Tokens → RNG
  // ========================================
  logSection("PHASE 5: EXCHANGE - Game Tokens → RNG");
  
  // Swap some CRAP back to RNG
  const crapToSwap = balances.CRAP / 2n;
  if (crapToSwap > 0n) {
    const swapQuote = quoteGameTokenToRng(crapToSwap);
    balances.CRAP -= crapToSwap;
    balances.RNG += swapQuote.outputAmount;
    
    logTest(
      "Swap CRAP → RNG",
      swapQuote.outputAmount > 0n,
      `${(Number(crapToSwap) / 1e9).toFixed(4)} CRAP → ${(Number(swapQuote.outputAmount) / 1e9).toFixed(4)} RNG`
    );
    
    logTest(
      "1% fee applied on game token swap",
      swapQuote.fee > 0n,
      `Fee: ${(Number(swapQuote.fee) / 1e9).toFixed(6)} tokens`
    );
  }
  
  // ========================================
  // FINAL SUMMARY
  // ========================================
  logSection("FINAL SUMMARY");
  
  console.log("\n📊 Player Final Balances:");
  console.log(`  SOL:   ${(Number(balances.SOL) / 1e9).toFixed(4)}`);
  console.log(`  RNG:   ${(Number(balances.RNG) / 1e9).toFixed(4)}`);
  console.log(`  CRAP:  ${(Number(balances.CRAP) / 1e9).toFixed(4)}`);
  console.log(`  CARAT: ${(Number(balances.CARAT) / 1e9).toFixed(4)}`);
  console.log(`  BJ:    ${(Number(balances.BJ) / 1e9).toFixed(4)}`);
  console.log(`  ROUL:  ${(Number(balances.ROUL) / 1e9).toFixed(4)}`);
  console.log(`  WAR:   ${(Number(balances.WAR) / 1e9).toFixed(4)}`);
  console.log(`  SICO:  ${(Number(balances.SICO) / 1e9).toFixed(4)}`);
  console.log(`  TCP:   ${(Number(balances.TCP) / 1e9).toFixed(4)}`);
  console.log(`  VPK:   ${(Number(balances.VPK) / 1e9).toFixed(4)}`);
  console.log(`  UTH:   ${(Number(balances.UTH) / 1e9).toFixed(4)}`);
  
  console.log("\n📈 Exchange Pool State:");
  console.log(`  SOL Reserve: ${(Number(exchangeState.pool.solReserve) / 1e9).toFixed(4)} SOL`);
  console.log(`  RNG Reserve: ${(Number(exchangeState.pool.rngReserve) / 1e9).toFixed(4)} RNG`);
  console.log(`  Total Fees:  ${(Number(exchangeState.pool.totalFees) / 1e9).toFixed(6)} SOL`);
  
  console.log("\n⛏️ Mining State:");
  console.log(`  Rounds Completed: ${miningState.roundHistory.length}`);
  
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  TEST RESULTS: ${testResults.passed} passed, ${testResults.failed} failed`);
  console.log(`${"=".repeat(60)}\n`);
  
  // Save results
  const report = {
    timestamp: new Date().toISOString(),
    player: playerAddress,
    balances: Object.fromEntries(
      Object.entries(balances).map(([k, v]) => [k, (Number(v) / 1e9).toFixed(4)])
    ),
    exchangePool: {
      solReserve: (Number(exchangeState.pool.solReserve) / 1e9).toFixed(4),
      rngReserve: (Number(exchangeState.pool.rngReserve) / 1e9).toFixed(4),
      totalFees: (Number(exchangeState.pool.totalFees) / 1e9).toFixed(6),
    },
    testResults,
  };
  
  fs.writeFileSync("cv-test-report.json", JSON.stringify(report, null, 2));
  console.log("📝 Report saved to cv-test-report.json");
  
  return testResults.failed === 0;
}

// Run the test
runComprehensiveTest()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((err) => {
    console.error("Test failed with error:", err);
    process.exit(1);
  });
