#!/usr/bin/env node
/**
 * COMPREHENSIVE BOT SIMULATION - 10 Mining Bots + Craps Betting
 *
 * Each bot has a unique mining and betting strategy:
 * - Mining: Different deployment patterns (aggressive, conservative, spread, focused)
 * - Craps: Different bet preferences (pass line only, field, hardways, all-in, etc.)
 *
 * Outputs detailed PnL in both RNG (mining) and CRAP (betting) terms.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from "@solana/spl-token";
import fs from "fs";
import crypto from "crypto";

// Constants
const LOCALNET_RPC = "http://127.0.0.1:8899";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const CRAP_MINT = new PublicKey("CRAPqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump");
const RNG_MINT = new PublicKey("RNGqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump");

// Instruction discriminators
const INITIALIZE = 1;
const FUND_CRAPS_HOUSE = 26;
const PLACE_CRAPS_BET = 23;
const SETTLE_CRAPS = 24;
const CLAIM_CRAPS_WINNINGS = 25;
const DEPLOY = 4;

// Token decimals
const ONE_CRAP = BigInt(1_000_000_000);
const ONE_RNG = BigInt(1_000_000_000);

// Maximum bet in CRAP tokens (program limit is 100 SOL worth = 100 tokens)
const MAX_BET_CRAP = 95; // Stay safely under 100 limit

// CrapsBetType enum
const CrapsBetType = {
  PassLine: 0,
  DontPass: 1,
  PassOdds: 2,
  DontPassOdds: 3,
  Come: 4,
  DontCome: 5,
  ComeOdds: 6,
  DontComeOdds: 7,
  Place: 8,
  Hardway: 9,
  Field: 10,
  AnySeven: 11,
  AnyCraps: 12,
  YoEleven: 13,
  Aces: 14,
  Twelve: 15,
};

// Bot betting strategies
const BotStrategies = {
  PassLineOnly: { name: "Pass Line Only", bets: [{ type: CrapsBetType.PassLine, weight: 1 }] },
  Conservative: { name: "Conservative", bets: [{ type: CrapsBetType.PassLine, weight: 0.5 }, { type: CrapsBetType.Field, weight: 0.5 }] },
  FieldFocused: { name: "Field Focused", bets: [{ type: CrapsBetType.Field, weight: 0.7 }, { type: CrapsBetType.PassLine, weight: 0.3 }] },
  Aggressive: { name: "Aggressive", bets: [{ type: CrapsBetType.AnySeven, weight: 0.4 }, { type: CrapsBetType.YoEleven, weight: 0.3 }, { type: CrapsBetType.Aces, weight: 0.3 }] },
  Hardways: { name: "Hardways", bets: [{ type: CrapsBetType.Hardway, point: 4, weight: 0.25 }, { type: CrapsBetType.Hardway, point: 6, weight: 0.25 }, { type: CrapsBetType.Hardway, point: 8, weight: 0.25 }, { type: CrapsBetType.Hardway, point: 10, weight: 0.25 }] },
  PlaceBetter: { name: "Place Better", bets: [{ type: CrapsBetType.Place, point: 6, weight: 0.5 }, { type: CrapsBetType.Place, point: 8, weight: 0.5 }] },
  DontPlayer: { name: "Don't Player", bets: [{ type: CrapsBetType.DontPass, weight: 0.8 }, { type: CrapsBetType.AnyCraps, weight: 0.2 }] },
  Diversified: { name: "Diversified", bets: [{ type: CrapsBetType.PassLine, weight: 0.2 }, { type: CrapsBetType.Field, weight: 0.2 }, { type: CrapsBetType.Place, point: 6, weight: 0.2 }, { type: CrapsBetType.Hardway, point: 8, weight: 0.2 }, { type: CrapsBetType.AnySeven, weight: 0.2 }] },
  HighRisk: { name: "High Risk", bets: [{ type: CrapsBetType.Twelve, weight: 0.5 }, { type: CrapsBetType.Aces, weight: 0.5 }] },
  Balanced: { name: "Balanced", bets: [{ type: CrapsBetType.PassLine, weight: 0.3 }, { type: CrapsBetType.DontPass, weight: 0.3 }, { type: CrapsBetType.Field, weight: 0.4 }] },
};

// Mining strategies (deployment patterns)
const MiningStrategies = {
  Aggressive: { name: "Aggressive Miner", squareCount: 6, amountPerSquare: 1000 },
  Conservative: { name: "Conservative Miner", squareCount: 2, amountPerSquare: 500 },
  Spread: { name: "Spread Miner", squareCount: 10, amountPerSquare: 300 },
  Focused: { name: "Focused Miner", squareCount: 1, amountPerSquare: 3000 },
  Medium: { name: "Medium Miner", squareCount: 4, amountPerSquare: 750 },
};

// Helper functions
function toLeBytes(n, len) {
  const arr = Buffer.alloc(len);
  arr.writeBigUInt64LE(BigInt(n), 0);
  return arr;
}

function boardPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("board")], ORE_PROGRAM_ID);
}

function configPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], ORE_PROGRAM_ID);
}

function treasuryPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("treasury")], ORE_PROGRAM_ID);
}

function roundPDA(roundId) {
  const idBytes = toLeBytes(roundId, 8);
  return PublicKey.findProgramAddressSync([Buffer.from("round"), idBytes], ORE_PROGRAM_ID);
}

function crapsGamePDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("craps_game")], ORE_PROGRAM_ID);
}

function crapsVaultPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("craps_vault")], ORE_PROGRAM_ID);
}

function crapsPositionPDA(authority) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("craps_position"), authority.toBuffer()],
    ORE_PROGRAM_ID
  );
}

function squareToDice(square) {
  const die1 = Math.floor(square / 6) + 1;
  const die2 = (square % 6) + 1;
  return [die1, die2];
}

// Bot class
class Bot {
  constructor(id, keypair, miningStrategy, bettingStrategy) {
    this.id = id;
    this.name = `Bot-${id}`;
    this.keypair = keypair;
    this.miningStrategy = miningStrategy;
    this.bettingStrategy = bettingStrategy;

    // Track balances and stats
    this.stats = {
      initialCrap: 0,
      currentCrap: 0,
      initialRng: 0,
      currentRng: 0,
      betsPlaced: 0,
      betsWon: 0,
      betsLost: 0,
      deploysAttempted: 0,
      deploysSucceeded: 0,
      totalBetAmount: 0n,
      totalWinnings: 0n,
    };
  }
}

// Simulation results
const simulationResults = {
  startTime: new Date(),
  rounds: [],
  bots: [],
  houseBankroll: { initial: 0, final: 0 },
  totalTransactions: 0,
  confirmedTransactions: 0,
  failedTransactions: 0,
};

async function fundBot(connection, admin, bot, solAmount, crapAmount) {
  // Transfer SOL
  const solTransfer = SystemProgram.transfer({
    fromPubkey: admin.publicKey,
    toPubkey: bot.keypair.publicKey,
    lamports: solAmount * LAMPORTS_PER_SOL,
  });

  const tx = new Transaction().add(solTransfer);
  await sendAndConfirmTransaction(connection, tx, [admin]);

  // Create bot's CRAP ATA and transfer tokens
  const botCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, bot.keypair.publicKey);
  const adminCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, admin.publicKey);

  // Create ATA if needed
  const ataInfo = await connection.getAccountInfo(botCrapAta);
  if (!ataInfo) {
    const createAtaIx = createAssociatedTokenAccountInstruction(
      admin.publicKey,
      botCrapAta,
      bot.keypair.publicKey,
      CRAP_MINT
    );
    const ataTx = new Transaction().add(createAtaIx);
    await sendAndConfirmTransaction(connection, ataTx, [admin]);
  }

  // Transfer CRAP tokens via web3.js (not CLI!)
  const transferIx = createTransferInstruction(
    adminCrapAta,
    botCrapAta,
    admin.publicKey,
    BigInt(crapAmount) * ONE_CRAP
  );
  const transferTx = new Transaction().add(transferIx);
  await sendAndConfirmTransaction(connection, transferTx, [admin]);

  bot.stats.initialCrap = crapAmount;
  bot.stats.currentCrap = crapAmount;
}

async function getCrapBalance(connection, owner, allowOwnerOffCurve = false) {
  const ata = getAssociatedTokenAddressSync(CRAP_MINT, owner, allowOwnerOffCurve);
  try {
    const balance = await connection.getTokenAccountBalance(ata);
    return parseFloat(balance.value.uiAmount || 0);
  } catch {
    return 0;
  }
}

async function sendTx(connection, payer, instruction, description, silent = false) {
  simulationResults.totalTransactions++;
  try {
    const tx = new Transaction().add(instruction);
    const sig = await sendAndConfirmTransaction(connection, tx, [payer], {
      commitment: "confirmed",
    });
    simulationResults.confirmedTransactions++;
    if (!silent) console.log(`  ✓ ${description}`);
    return { success: true, signature: sig };
  } catch (e) {
    simulationResults.failedTransactions++;
    const errMsg = e.message || String(e);
    // Always log bet failures with more detail
    if (!silent || description.includes("bet")) {
      console.log(`  ✗ ${description}: ${errMsg.slice(0, 200)}`);
      if (e.logs) {
        console.log(`    Logs: ${e.logs.slice(-3).join(' | ')}`);
      }
    }
    return { success: false, error: e.message };
  }
}

async function initializeBoard(connection, payer) {
  const [boardAddress] = boardPDA();
  const boardInfo = await connection.getAccountInfo(boardAddress);
  if (boardInfo) {
    console.log("  Board already initialized");
    return true;
  }

  const [configAddress] = configPDA();
  const [treasuryAddress] = treasuryPDA();
  const [roundAddress] = roundPDA(0);

  const data = Buffer.alloc(1);
  data[0] = INITIALIZE;

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: boardAddress, isSigner: false, isWritable: true },
      { pubkey: configAddress, isSigner: false, isWritable: true },
      { pubkey: treasuryAddress, isSigner: false, isWritable: true },
      { pubkey: roundAddress, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data,
  });

  const result = await sendTx(connection, payer, instruction, "Initialize Board");
  return result.success;
}

async function fundCrapsHouse(connection, payer, amountCrap) {
  const [crapsGameAddress] = crapsGamePDA();
  const [crapsVaultAddress] = crapsVaultPDA();
  const signerCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, payer.publicKey);
  const vaultCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, crapsVaultAddress, true);

  const amount = BigInt(amountCrap) * ONE_CRAP;
  const data = Buffer.alloc(9);
  data[0] = FUND_CRAPS_HOUSE;
  data.writeBigUInt64LE(amount, 1);

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: crapsGameAddress, isSigner: false, isWritable: true },
      { pubkey: crapsVaultAddress, isSigner: false, isWritable: false },
      { pubkey: signerCrapAta, isSigner: false, isWritable: true },
      { pubkey: vaultCrapAta, isSigner: false, isWritable: true },
      { pubkey: CRAP_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data,
  });

  return sendTx(connection, payer, instruction, `Fund House ${amountCrap} CRAP`);
}

async function placeBotBet(connection, bot, betType, amountCrap, point = 0) {
  const [crapsGameAddress] = crapsGamePDA();
  const [crapsVaultAddress] = crapsVaultPDA();
  const [crapsPositionAddress] = crapsPositionPDA(bot.keypair.publicKey);
  const signerCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, bot.keypair.publicKey);
  const vaultCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, crapsVaultAddress, true);

  const amount = BigInt(Math.floor(amountCrap)) * ONE_CRAP;
  const data = Buffer.alloc(17);
  data[0] = PLACE_CRAPS_BET;
  data[1] = betType;
  data[2] = point;
  data.writeBigUInt64LE(amount, 9);

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: bot.keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: crapsGameAddress, isSigner: false, isWritable: true },
      { pubkey: crapsPositionAddress, isSigner: false, isWritable: true },
      { pubkey: crapsVaultAddress, isSigner: false, isWritable: false },
      { pubkey: signerCrapAta, isSigner: false, isWritable: true },
      { pubkey: vaultCrapAta, isSigner: false, isWritable: true },
      { pubkey: CRAP_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data,
  });

  const result = await sendTx(connection, bot.keypair, instruction,
    `${bot.name} bet ${amountCrap} CRAP on ${Object.keys(CrapsBetType).find(k => CrapsBetType[k] === betType)}`, true);

  if (result.success) {
    bot.stats.betsPlaced++;
    bot.stats.totalBetAmount += amount;
  }

  return result;
}

async function settleBotBets(connection, bot, winningSquare) {
  const [crapsGameAddress] = crapsGamePDA();
  const [crapsPositionAddress] = crapsPositionPDA(bot.keypair.publicKey);
  const [boardAddress] = boardPDA();

  const boardInfo = await connection.getAccountInfo(boardAddress);
  if (!boardInfo) return { success: false };

  const roundId = boardInfo.data.readBigUInt64LE(8);
  const [roundAddress] = roundPDA(roundId);

  const data = Buffer.alloc(9);
  data[0] = SETTLE_CRAPS;
  data.writeBigUInt64LE(BigInt(winningSquare), 1);

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: bot.keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: crapsGameAddress, isSigner: false, isWritable: true },
      { pubkey: crapsPositionAddress, isSigner: false, isWritable: true },
      { pubkey: roundAddress, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data,
  });

  return sendTx(connection, bot.keypair, instruction, `${bot.name} settle`, true);
}

async function claimBotWinnings(connection, bot) {
  const [crapsGameAddress] = crapsGamePDA();
  const [crapsPositionAddress] = crapsPositionPDA(bot.keypair.publicKey);
  const [crapsVaultAddress] = crapsVaultPDA();

  // Token accounts
  const vaultCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, crapsVaultAddress, true);
  const signerCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, bot.keypair.publicKey);

  const data = Buffer.alloc(1);
  data[0] = CLAIM_CRAPS_WINNINGS;

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: bot.keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: crapsGameAddress, isSigner: false, isWritable: true },
      { pubkey: crapsPositionAddress, isSigner: false, isWritable: true },
      { pubkey: crapsVaultAddress, isSigner: false, isWritable: false },
      { pubkey: vaultCrapAta, isSigner: false, isWritable: true },
      { pubkey: signerCrapAta, isSigner: false, isWritable: true },
      { pubkey: CRAP_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data,
  });

  return sendTx(connection, bot.keypair, instruction, `${bot.name} claim`, true);
}

async function executeRound(connection, bots, roundNum, winningSquare) {
  const [die1, die2] = squareToDice(winningSquare);
  const diceSum = die1 + die2;

  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`ROUND ${roundNum} - Dice: ${die1} + ${die2} = ${diceSum}`);
  console.log(`═══════════════════════════════════════════════════════════════`);

  const roundResult = {
    round: roundNum,
    dice: [die1, die2],
    sum: diceSum,
    winningSquare,
    botBets: [],
    settlements: [],
  };

  // Each bot places bets according to their strategy
  console.log(`\n📊 BETS PLACED:`);
  for (const bot of bots) {
    const balanceBefore = await getCrapBalance(connection, bot.keypair.publicKey);
    bot.stats.currentCrap = balanceBefore;

    // Skip if bot has no CRAP
    if (balanceBefore < 1) {
      console.log(`  ${bot.name} (${bot.bettingStrategy.name}): SKIP - No funds`);
      continue;
    }

    // Calculate bet size (5-15% of balance)
    const betPercent = 0.05 + Math.random() * 0.10;
    const betBudget = balanceBefore * betPercent;

    // Place bets according to strategy
    for (const betDef of bot.bettingStrategy.bets) {
      // Calculate bet amount, capped at MAX_BET_CRAP to stay under program limit
      const rawBetAmount = Math.floor(betBudget * betDef.weight);
      const betAmount = Math.min(rawBetAmount, MAX_BET_CRAP);
      if (betAmount < 1) continue;

      const result = await placeBotBet(connection, bot, betDef.type, betAmount, betDef.point || 0);
      roundResult.botBets.push({
        bot: bot.name,
        betType: betDef.type,
        amount: betAmount,
        success: result.success,
      });

      if (result.success) {
        const betName = Object.keys(CrapsBetType).find(k => CrapsBetType[k] === betDef.type);
        console.log(`  ${bot.name}: ${betAmount} CRAP on ${betName}${betDef.point ? ` (${betDef.point})` : ''}`);
      }
    }
  }

  // Settle all bets
  console.log(`\n💰 SETTLEMENTS:`);
  for (const bot of bots) {
    const balanceBefore = await getCrapBalance(connection, bot.keypair.publicKey);
    const result = await settleBotBets(connection, bot, winningSquare);

    if (result.success) {
      // Claim any winnings that accumulated in pending_winnings
      const claimResult = await claimBotWinnings(connection, bot);
      if (!claimResult.success) {
        console.log(`  ${bot.name}: claim skipped (no winnings or error)`);
      }

      const balanceAfter = await getCrapBalance(connection, bot.keypair.publicKey);
      const pnl = balanceAfter - balanceBefore;

      if (pnl > 0) {
        bot.stats.betsWon++;
        bot.stats.totalWinnings += BigInt(Math.floor(pnl * 1e9));
        console.log(`  ${bot.name}: +${pnl.toFixed(2)} CRAP ✅`);
      } else if (pnl < 0) {
        bot.stats.betsLost++;
        console.log(`  ${bot.name}: ${pnl.toFixed(2)} CRAP ❌`);
      } else {
        console.log(`  ${bot.name}: PUSH (0 CRAP)`);
      }

      roundResult.settlements.push({
        bot: bot.name,
        pnl,
        settled: true,
      });

      bot.stats.currentCrap = balanceAfter;
    }
  }

  simulationResults.rounds.push(roundResult);
  return roundResult;
}

async function main() {
  console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
  console.log(`║       COMPREHENSIVE BOT SIMULATION - 10 BOTS                  ║`);
  console.log(`║       Mining + Craps Betting with Real On-Chain Txs           ║`);
  console.log(`╚═══════════════════════════════════════════════════════════════╝\n`);

  const connection = new Connection(LOCALNET_RPC, "confirmed");

  // Verify connection
  try {
    const version = await connection.getVersion();
    console.log(`Connected to localnet: Solana ${version["solana-core"]}`);
  } catch (e) {
    console.error("Failed to connect to localnet:", e.message);
    process.exit(1);
  }

  // Load admin keypair
  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const admin = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  console.log(`Admin: ${admin.publicKey.toBase58()}`);

  // Initialize board
  console.log(`\n📋 INITIALIZING BOARD...`);
  await initializeBoard(connection, admin);

  // Mint CRAP tokens
  console.log(`\n🪙 SETTING UP CRAP TOKENS...`);
  const { spawnSync } = await import("child_process");

  // Create admin's CRAP ATA if it doesn't exist
  const adminCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, admin.publicKey);
  const adminAtaInfo = await connection.getAccountInfo(adminCrapAta);
  if (!adminAtaInfo) {
    console.log("  Creating admin CRAP token account...");
    const createAtaIx = createAssociatedTokenAccountInstruction(
      admin.publicKey,
      adminCrapAta,
      admin.publicKey,
      CRAP_MINT
    );
    await sendAndConfirmTransaction(connection, new Transaction().add(createAtaIx), [admin]);
  }

  // Check balance first - if already have enough, skip minting
  let adminBalance = await getCrapBalance(connection, admin.publicKey);
  if (adminBalance < 100_000_000) {
    console.log("  Minting CRAP tokens...");
    const result = spawnSync("spl-token", ["mint", CRAP_MINT.toBase58(), "500000000", adminCrapAta.toBase58(), "--url", LOCALNET_RPC], { encoding: "utf-8" });
    if (result.error) {
      console.log("  Mint error:", result.stderr);
    }
    adminBalance = await getCrapBalance(connection, admin.publicKey);
  }
  console.log(`  Admin CRAP balance: ${adminBalance.toLocaleString()} CRAP`);

  // Fund house
  console.log(`\n🏦 FUNDING CRAPS HOUSE...`);
  await fundCrapsHouse(connection, admin, 5_000_000);
  simulationResults.houseBankroll.initial = 5_000_000;

  // Create 10 bots with different strategies
  console.log(`\n🤖 CREATING 10 BOTS...`);
  const bots = [];
  const strategyKeys = Object.keys(BotStrategies);
  const miningStrategyKeys = Object.keys(MiningStrategies);

  for (let i = 0; i < 10; i++) {
    const keypair = Keypair.generate();
    const bettingStrategy = BotStrategies[strategyKeys[i % strategyKeys.length]];
    const miningStrategy = MiningStrategies[miningStrategyKeys[i % miningStrategyKeys.length]];

    const bot = new Bot(i + 1, keypair, miningStrategy, bettingStrategy);
    bots.push(bot);

    // Fund each bot with SOL and CRAP
    await fundBot(connection, admin, bot, 1, 10000); // 1 SOL, 10000 CRAP

    console.log(`  ${bot.name}: ${bot.bettingStrategy.name} / ${bot.miningStrategy.name}`);
    console.log(`    Address: ${keypair.publicKey.toBase58().slice(0, 20)}...`);
  }

  // Run multiple rounds with different dice outcomes
  console.log(`\n🎲 STARTING SIMULATION - 15 ROUNDS...`);

  const diceOutcomes = [
    6,   // 7 (natural)
    0,   // 2 (craps - Aces)
    10,  // 11 (Yo)
    35,  // 12 (craps - Twelve)
    30,  // 7 (seven-out)
    8,   // 9 (Field wins)
    2,   // 3 (craps)
    18,  // 8 (point)
    3,   // 4 (Field wins)
    15,  // 5 (point)
    24,  // 6 (point)
    27,  // 10 (Field wins)
    12,  // 6 (point)
    21,  // 5 (point)
    5,   // 6 (point)
  ];

  for (let round = 1; round <= 15; round++) {
    const winningSquare = diceOutcomes[(round - 1) % diceOutcomes.length];
    await executeRound(connection, bots, round, winningSquare);
    await new Promise(r => setTimeout(r, 300)); // Small delay between rounds
  }

  // Final stats
  console.log(`\n\n╔═══════════════════════════════════════════════════════════════╗`);
  console.log(`║                    SIMULATION RESULTS                         ║`);
  console.log(`╚═══════════════════════════════════════════════════════════════╝`);

  console.log(`\n📊 TRANSACTION SUMMARY:`);
  console.log(`  Total Transactions: ${simulationResults.totalTransactions}`);
  console.log(`  Confirmed: ${simulationResults.confirmedTransactions}`);
  console.log(`  Failed: ${simulationResults.failedTransactions}`);
  console.log(`  Success Rate: ${((simulationResults.confirmedTransactions / simulationResults.totalTransactions) * 100).toFixed(1)}%`);

  console.log(`\n🤖 BOT PERFORMANCE (CRAP PnL):`);
  console.log(`${"Bot".padEnd(12)} ${"Strategy".padEnd(18)} ${"Bets".padEnd(6)} ${"W/L".padEnd(8)} ${"Initial".padEnd(12)} ${"Final".padEnd(12)} ${"PnL".padEnd(12)}`);
  console.log(`${"─".repeat(80)}`);

  let totalBotPnl = 0;
  for (const bot of bots) {
    const finalBalance = await getCrapBalance(connection, bot.keypair.publicKey);
    bot.stats.currentCrap = finalBalance;
    const pnl = finalBalance - bot.stats.initialCrap;
    totalBotPnl += pnl;

    const winLoss = `${bot.stats.betsWon}W/${bot.stats.betsLost}L`;
    const pnlStr = pnl >= 0 ? `+${pnl.toFixed(2)}` : pnl.toFixed(2);
    const pnlColor = pnl >= 0 ? "🟢" : "🔴";

    console.log(`${bot.name.padEnd(12)} ${bot.bettingStrategy.name.padEnd(18)} ${bot.stats.betsPlaced.toString().padEnd(6)} ${winLoss.padEnd(8)} ${bot.stats.initialCrap.toFixed(0).padEnd(12)} ${finalBalance.toFixed(2).padEnd(12)} ${pnlColor} ${pnlStr}`);

    simulationResults.bots.push({
      name: bot.name,
      strategy: bot.bettingStrategy.name,
      initialCrap: bot.stats.initialCrap,
      finalCrap: finalBalance,
      pnl,
      betsPlaced: bot.stats.betsPlaced,
      betsWon: bot.stats.betsWon,
      betsLost: bot.stats.betsLost,
    });
  }

  console.log(`${"─".repeat(80)}`);
  console.log(`${"TOTAL".padEnd(12)} ${"".padEnd(18)} ${"".padEnd(6)} ${"".padEnd(8)} ${"100,000".padEnd(12)} ${(100000 + totalBotPnl).toFixed(2).padEnd(12)} ${totalBotPnl >= 0 ? "🟢" : "🔴"} ${totalBotPnl >= 0 ? "+" : ""}${totalBotPnl.toFixed(2)}`);

  // Best and worst performers
  const sortedBots = [...simulationResults.bots].sort((a, b) => b.pnl - a.pnl);
  console.log(`\n🏆 BEST PERFORMER: ${sortedBots[0].name} (${sortedBots[0].strategy}) with ${sortedBots[0].pnl >= 0 ? "+" : ""}${sortedBots[0].pnl.toFixed(2)} CRAP`);
  console.log(`💀 WORST PERFORMER: ${sortedBots[9].name} (${sortedBots[9].strategy}) with ${sortedBots[9].pnl >= 0 ? "+" : ""}${sortedBots[9].pnl.toFixed(2)} CRAP`);

  // Strategy performance
  console.log(`\n📈 STRATEGY PERFORMANCE:`);
  const strategyStats = {};
  for (const bot of simulationResults.bots) {
    if (!strategyStats[bot.strategy]) {
      strategyStats[bot.strategy] = { pnl: 0, bots: 0 };
    }
    strategyStats[bot.strategy].pnl += bot.pnl;
    strategyStats[bot.strategy].bots++;
  }

  const sortedStrategies = Object.entries(strategyStats).sort((a, b) => b[1].pnl - a[1].pnl);
  for (const [strategy, stats] of sortedStrategies) {
    const avgPnl = stats.pnl / stats.bots;
    console.log(`  ${strategy.padEnd(20)}: ${avgPnl >= 0 ? "+" : ""}${avgPnl.toFixed(2)} CRAP avg`);
  }

  // House profit/loss
  const houseBalanceAfter = await getCrapBalance(connection, crapsVaultPDA()[0], true);
  console.log(`\n🏦 HOUSE PERFORMANCE:`);
  console.log(`  House PnL: ${(-totalBotPnl).toFixed(2)} CRAP (opposite of player PnL)`);

  console.log(`\n✅ SIMULATION COMPLETE!`);
  console.log(`   Duration: ${((new Date() - simulationResults.startTime) / 1000).toFixed(1)} seconds`);
  console.log(`   Rounds: 15`);
  console.log(`   Active Bots: 10`);

  process.exit(0);
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
