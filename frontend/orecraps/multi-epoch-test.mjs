#!/usr/bin/env node
/**
 * Multi-Epoch Comprehensive Test Script
 *
 * Tests the full flow: faucet -> bet -> roll -> settle across multiple epochs
 * Tracks on-chain state, P&L, and identifies issues.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";
import crypto from "crypto";

// Constants
const PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const RNG_MINT = new PublicKey("8HJyJPD4iWD1X9FxZEjDuVpPqSBvNeaJCczXeK2xsShs");
const CRAP_MINT = new PublicKey("7frAenkamJSASBH9YukkzBsSMz9paQdYuSGw4SjWkXrf");

// Instruction discriminators
const PLACE_CRAPS_BET_IX = 23;
const SETTLE_CRAPS_IX = 24;
const CLAIM_CRAPS_WINNINGS_IX = 25;

// Bet types
const BetType = {
  PassLine: 0,
  DontPass: 1,
  Field: 10,
  AnySeven: 11,
  AnyCraps: 12,
  YoEleven: 13,
  Aces: 14,
  Twelve: 15,
  Place4: { type: 8, point: 4 },
  Place5: { type: 8, point: 5 },
  Place6: { type: 8, point: 6 },
  Place8: { type: 8, point: 8 },
  Place9: { type: 8, point: 9 },
  Place10: { type: 8, point: 10 },
};

// PDAs
function boardPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("board")], PROGRAM_ID);
}

function roundPDA(roundId) {
  const idBytes = Buffer.alloc(8);
  idBytes.writeBigUInt64LE(roundId);
  return PublicKey.findProgramAddressSync([Buffer.from("round"), idBytes], PROGRAM_ID);
}

function crapsGamePDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("craps_game")], PROGRAM_ID);
}

function crapsPositionPDA(authority) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("craps_position"), authority.toBuffer()],
    PROGRAM_ID
  );
}

function crapsVaultPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("craps_vault")], PROGRAM_ID);
}

// Helpers
function squareToDice(square) {
  const die1 = Math.floor(square / 6) + 1;
  const die2 = (square % 6) + 1;
  return [die1, die2];
}

function diceToSquare(die1, die2) {
  return (die1 - 1) * 6 + (die2 - 1);
}

function sumToSquare(targetSum) {
  for (let d1 = 1; d1 <= 6; d1++) {
    for (let d2 = 1; d2 <= 6; d2++) {
      if (d1 + d2 === targetSum) {
        return diceToSquare(d1, d2);
      }
    }
  }
  throw new Error(`Invalid target sum: ${targetSum}`);
}

function generateRandomSquare() {
  const randomBytes = crypto.randomBytes(8);
  const sample = randomBytes.readBigUInt64LE(0);
  return Number(sample % 36n);
}

// Parse on-chain state
async function parseGameState(connection) {
  const [crapsGameAddress] = crapsGamePDA();
  const account = await connection.getAccountInfo(crapsGameAddress);
  if (!account) return null;

  const data = account.data;
  return {
    epochId: data.readBigUInt64LE(8),
    point: data.readUInt8(16),
    isComeOut: data.readUInt8(17) === 1,
    houseBankroll: data.readBigUInt64LE(32),
    totalCollected: data.readBigUInt64LE(40),
    totalPayouts: data.readBigUInt64LE(48),
  };
}

async function parsePosition(connection, authority) {
  const [positionAddress] = crapsPositionPDA(authority);
  const account = await connection.getAccountInfo(positionAddress);
  if (!account) return null;

  const data = account.data;
  // Correct offsets based on CrapsPosition struct layout:
  // 8: authority (32 bytes), 40: epoch_id, 48: pass_line, 56: dont_pass, 64: pass_odds, 72: dont_pass_odds
  // 80: come_bets[6], 128: come_odds[6], 176: dont_come_bets[6], 224: dont_come_odds[6]
  // 272: place_bets[6], 320: place_working + 7 padding, 328: hardways[4]
  // 360: field_bet, 368: any_seven, 376: any_craps, 384: yo_eleven, 392: aces, 400: twelve
  // Bonus bets at 408-559, then: 560: pending_winnings
  return {
    epochId: data.readBigUInt64LE(40),
    passLine: data.readBigUInt64LE(48),
    dontPass: data.readBigUInt64LE(56),
    passOdds: data.readBigUInt64LE(64),
    dontPassOdds: data.readBigUInt64LE(72),
    // Come bets at offset 80 (6 * 8 = 48 bytes)
    comeBets: Array.from({ length: 6 }, (_, i) => data.readBigUInt64LE(80 + i * 8)),
    // Come odds at offset 128 (6 * 8 = 48 bytes)
    comeOdds: Array.from({ length: 6 }, (_, i) => data.readBigUInt64LE(128 + i * 8)),
    // Don't Come bets at offset 176 (6 * 8 = 48 bytes)
    dontComeBets: Array.from({ length: 6 }, (_, i) => data.readBigUInt64LE(176 + i * 8)),
    // Don't Come odds at offset 224 (6 * 8 = 48 bytes)
    dontComeOdds: Array.from({ length: 6 }, (_, i) => data.readBigUInt64LE(224 + i * 8)),
    // Place bets at offset 272 (6 * 8 = 48 bytes)
    placeBets: Array.from({ length: 6 }, (_, i) => data.readBigUInt64LE(272 + i * 8)),
    // Hardways at offset 328 (4 * 8 = 32 bytes)
    hardways: Array.from({ length: 4 }, (_, i) => data.readBigUInt64LE(328 + i * 8)),
    // Single-roll bets
    fieldBet: data.readBigUInt64LE(360),
    anySeven: data.readBigUInt64LE(368),
    anyCraps: data.readBigUInt64LE(376),
    yoEleven: data.readBigUInt64LE(384),
    aces: data.readBigUInt64LE(392),
    twelve: data.readBigUInt64LE(400),
    // Pending winnings at offset 560 (after bonus bets)
    pendingWinnings: data.readBigUInt64LE(560),
    totalWagered: data.readBigUInt64LE(568),
    totalWon: data.readBigUInt64LE(576),
    totalLost: data.readBigUInt64LE(584),
  };
}

async function getTokenBalance(connection, mint, owner) {
  try {
    const ata = await getAssociatedTokenAddress(mint, owner);
    const balance = await connection.getTokenAccountBalance(ata);
    return Number(balance.value.uiAmount || 0);
  } catch {
    return 0;
  }
}

// Build instructions
async function buildPlaceBetInstruction(connection, signer, betType, point, amount) {
  const [crapsGameAddress] = crapsGamePDA();
  const [crapsPositionAddress] = crapsPositionPDA(signer);
  const [crapsVaultAddress] = crapsVaultPDA();
  const signerCrapAta = await getAssociatedTokenAddress(CRAP_MINT, signer);
  const vaultCrapAta = await getAssociatedTokenAddress(CRAP_MINT, crapsVaultAddress, true);

  const data = Buffer.alloc(17);
  data.writeUInt8(PLACE_CRAPS_BET_IX, 0);
  data.writeUInt8(betType, 1);
  data.writeUInt8(point, 2);
  data.writeBigUInt64LE(amount, 9);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
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
    data,
  });
}

function buildSettleCrapsInstruction(signer, winningSquare, roundId) {
  const [crapsGameAddress] = crapsGamePDA();
  const [crapsPositionAddress] = crapsPositionPDA(signer);
  const [roundAddress] = roundPDA(roundId);

  const data = Buffer.alloc(9);
  data.writeUInt8(SETTLE_CRAPS_IX, 0);
  data.writeBigUInt64LE(BigInt(winningSquare), 1);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: crapsGameAddress, isSigner: false, isWritable: true },
      { pubkey: crapsPositionAddress, isSigner: false, isWritable: true },
      { pubkey: roundAddress, isSigner: false, isWritable: false },
    ],
    data,
  });
}

async function buildClaimInstruction(connection, signer) {
  const [crapsGameAddress] = crapsGamePDA();
  const [crapsPositionAddress] = crapsPositionPDA(signer);
  const [crapsVaultAddress] = crapsVaultPDA();
  const signerCrapAta = await getAssociatedTokenAddress(CRAP_MINT, signer);
  const vaultCrapAta = await getAssociatedTokenAddress(CRAP_MINT, crapsVaultAddress, true);

  const data = Buffer.alloc(1);
  data.writeUInt8(CLAIM_CRAPS_WINNINGS_IX, 0);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: crapsGameAddress, isSigner: false, isWritable: true },
      { pubkey: crapsPositionAddress, isSigner: false, isWritable: true },
      { pubkey: crapsVaultAddress, isSigner: false, isWritable: false },
      { pubkey: vaultCrapAta, isSigner: false, isWritable: true },
      { pubkey: signerCrapAta, isSigner: false, isWritable: true },
      { pubkey: CRAP_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

// Test result tracking
const testResults = {
  epochs: [],
  issues: [],
  totalBets: 0,
  totalWins: 0,
  totalLosses: 0,
  totalPnL: 0,
  passLineBets: { placed: 0, won: 0, lost: 0, pending: 0 },
  fieldBets: { placed: 0, won: 0, lost: 0 },
  propBets: { placed: 0, won: 0, lost: 0 },
};

function logIssue(category, description, details = {}) {
  const issue = { category, description, details, timestamp: new Date().toISOString() };
  testResults.issues.push(issue);
  console.error(`[ISSUE] ${category}: ${description}`, details);
}

// Main test function
async function runEpochTest(connection, signer, epochNum, targetRoll = null) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`EPOCH ${epochNum} TEST`);
  console.log(`${"=".repeat(60)}`);

  const epochData = {
    epochNum,
    startTime: new Date().toISOString(),
    initialState: null,
    betsPlaced: [],
    roll: null,
    settlements: [],
    finalState: null,
    pnl: 0,
    issues: [],
  };

  try {
    // 1. Get initial state
    console.log("\n--- Initial State ---");
    const initialGame = await parseGameState(connection);
    const initialPosition = await parsePosition(connection, signer.publicKey);
    const initialCrapBalance = await getTokenBalance(connection, CRAP_MINT, signer.publicKey);

    epochData.initialState = {
      game: initialGame,
      position: initialPosition,
      crapBalance: initialCrapBalance,
    };

    console.log(`Game: epoch=${initialGame?.epochId}, point=${initialGame?.point}, comeOut=${initialGame?.isComeOut}`);
    console.log(`Position: passLine=${initialPosition?.passLine ? Number(initialPosition.passLine) / 1e9 : 0}`);
    console.log(`CRAP Balance: ${initialCrapBalance.toFixed(4)}`);

    // Check if we're in come-out phase
    const isComeOut = initialGame?.isComeOut ?? true;
    const currentPoint = initialGame?.point ?? 0;

    // 2. Place bets based on game phase
    console.log("\n--- Placing Bets ---");
    const betAmount = BigInt(Math.floor(0.01 * 1e9)); // 0.01 CRAP

    if (isComeOut) {
      // Come-out phase: place Pass Line + Field
      console.log("Phase: Come-Out - Placing Pass Line and Field bets");

      // Pass Line bet
      try {
        const passLineIx = await buildPlaceBetInstruction(
          connection,
          signer.publicKey,
          BetType.PassLine,
          0,
          betAmount
        );
        const tx = new Transaction().add(passLineIx);
        const sig = await sendAndConfirmTransaction(connection, tx, [signer], { commitment: "confirmed" });
        console.log(`  Pass Line bet placed: ${sig.slice(0, 20)}...`);
        epochData.betsPlaced.push({ type: "PassLine", amount: 0.01, sig });
        testResults.passLineBets.placed++;
        testResults.totalBets++;
      } catch (err) {
        logIssue("BET_PLACEMENT", "Failed to place Pass Line bet", { error: err.message });
        epochData.issues.push({ type: "BET_PLACEMENT", bet: "PassLine", error: err.message });
      }

      // Field bet
      try {
        const fieldIx = await buildPlaceBetInstruction(
          connection,
          signer.publicKey,
          BetType.Field,
          0,
          betAmount
        );
        const tx = new Transaction().add(fieldIx);
        const sig = await sendAndConfirmTransaction(connection, tx, [signer], { commitment: "confirmed" });
        console.log(`  Field bet placed: ${sig.slice(0, 20)}...`);
        epochData.betsPlaced.push({ type: "Field", amount: 0.01, sig });
        testResults.fieldBets.placed++;
        testResults.totalBets++;
      } catch (err) {
        logIssue("BET_PLACEMENT", "Failed to place Field bet", { error: err.message });
        epochData.issues.push({ type: "BET_PLACEMENT", bet: "Field", error: err.message });
      }
    } else {
      // Point phase: place Place bets and Field
      console.log(`Phase: Point (${currentPoint}) - Placing Place and Field bets`);

      // Place bet on current point
      try {
        const placeIx = await buildPlaceBetInstruction(
          connection,
          signer.publicKey,
          8, // Place bet type
          currentPoint,
          betAmount
        );
        const tx = new Transaction().add(placeIx);
        const sig = await sendAndConfirmTransaction(connection, tx, [signer], { commitment: "confirmed" });
        console.log(`  Place ${currentPoint} bet placed: ${sig.slice(0, 20)}...`);
        epochData.betsPlaced.push({ type: `Place${currentPoint}`, amount: 0.01, sig });
        testResults.totalBets++;
      } catch (err) {
        logIssue("BET_PLACEMENT", `Failed to place Place ${currentPoint} bet`, { error: err.message });
        epochData.issues.push({ type: "BET_PLACEMENT", bet: `Place${currentPoint}`, error: err.message });
      }

      // Field bet
      try {
        const fieldIx = await buildPlaceBetInstruction(
          connection,
          signer.publicKey,
          BetType.Field,
          0,
          betAmount
        );
        const tx = new Transaction().add(fieldIx);
        const sig = await sendAndConfirmTransaction(connection, tx, [signer], { commitment: "confirmed" });
        console.log(`  Field bet placed: ${sig.slice(0, 20)}...`);
        epochData.betsPlaced.push({ type: "Field", amount: 0.01, sig });
        testResults.fieldBets.placed++;
        testResults.totalBets++;
      } catch (err) {
        logIssue("BET_PLACEMENT", "Failed to place Field bet", { error: err.message });
        epochData.issues.push({ type: "BET_PLACEMENT", bet: "Field", error: err.message });
      }
    }

    // 3. Get state after bets (add delay for devnet state propagation)
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log("\n--- State After Bets ---");
    const afterBetsPosition = await parsePosition(connection, signer.publicKey);
    const afterBetsCrapBalance = await getTokenBalance(connection, CRAP_MINT, signer.publicKey);

    console.log(`Position: passLine=${afterBetsPosition?.passLine ? Number(afterBetsPosition.passLine) / 1e9 : 0}`);
    console.log(`Field: ${afterBetsPosition?.fieldBet ? Number(afterBetsPosition.fieldBet) / 1e9 : 0}`);
    console.log(`CRAP Balance: ${afterBetsCrapBalance.toFixed(4)} (change: ${(afterBetsCrapBalance - initialCrapBalance).toFixed(4)})`);

    // Verify bets were recorded
    if (isComeOut && afterBetsPosition?.passLine === 0n) {
      logIssue("STATE_MISMATCH", "Pass Line bet not recorded in position", {
        expected: betAmount.toString(),
        actual: "0",
      });
    }
    if (afterBetsPosition?.fieldBet === 0n) {
      logIssue("STATE_MISMATCH", "Field bet not recorded in position", {
        expected: betAmount.toString(),
        actual: "0",
      });
    }

    // 4. Roll dice and settle
    console.log("\n--- Rolling Dice ---");
    const [boardAddress] = boardPDA();
    const boardAccount = await connection.getAccountInfo(boardAddress);
    const roundId = boardAccount.data.readBigUInt64LE(8);

    // Generate or use provided roll
    const winningSquare = targetRoll !== null ? sumToSquare(targetRoll) : generateRandomSquare();
    const [die1, die2] = squareToDice(winningSquare);
    const diceSum = die1 + die2;

    epochData.roll = { die1, die2, sum: diceSum, square: winningSquare };
    console.log(`Roll: ${die1} + ${die2} = ${diceSum} (square ${winningSquare})`);

    // Settle
    try {
      const settleIx = buildSettleCrapsInstruction(signer.publicKey, winningSquare, roundId);
      const tx = new Transaction().add(settleIx);
      const sig = await sendAndConfirmTransaction(connection, tx, [signer], { commitment: "confirmed" });
      console.log(`Settlement: ${sig.slice(0, 20)}...`);
      epochData.settlements.push({ sig, success: true });
    } catch (err) {
      logIssue("SETTLEMENT", "Failed to settle bets", { error: err.message, roll: diceSum });
      epochData.issues.push({ type: "SETTLEMENT", error: err.message });
      epochData.settlements.push({ error: err.message, success: false });
    }

    // 5. Get final state
    console.log("\n--- Final State ---");
    await new Promise(r => setTimeout(r, 1000)); // Wait for state propagation

    const finalGame = await parseGameState(connection);
    const finalPosition = await parsePosition(connection, signer.publicKey);
    const finalCrapBalance = await getTokenBalance(connection, CRAP_MINT, signer.publicKey);

    epochData.finalState = {
      game: finalGame,
      position: finalPosition,
      crapBalance: finalCrapBalance,
    };

    console.log(`Game: epoch=${finalGame?.epochId}, point=${finalGame?.point}, comeOut=${finalGame?.isComeOut}`);
    console.log(`Position: passLine=${finalPosition?.passLine ? Number(finalPosition.passLine) / 1e9 : 0}`);
    console.log(`Pending Winnings: ${finalPosition?.pendingWinnings ? Number(finalPosition.pendingWinnings) / 1e9 : 0}`);
    console.log(`CRAP Balance: ${finalCrapBalance.toFixed(4)}`);

    // 6. Calculate P&L
    const balanceChange = finalCrapBalance - initialCrapBalance;
    const pendingWinnings = finalPosition?.pendingWinnings ? Number(finalPosition.pendingWinnings) / 1e9 : 0;
    epochData.pnl = balanceChange + pendingWinnings;
    testResults.totalPnL += epochData.pnl;

    console.log(`\n--- Epoch ${epochNum} P&L: ${epochData.pnl >= 0 ? "+" : ""}${epochData.pnl.toFixed(4)} CRAP ---`);

    // 7. Analyze results
    analyzeEpochResults(epochData, isComeOut, currentPoint, diceSum);

    // 8. Claim winnings if any
    if (pendingWinnings > 0) {
      console.log("\n--- Claiming Winnings ---");
      try {
        const claimIx = await buildClaimInstruction(connection, signer.publicKey);
        const tx = new Transaction().add(claimIx);
        const sig = await sendAndConfirmTransaction(connection, tx, [signer], { commitment: "confirmed" });
        console.log(`Claimed ${pendingWinnings.toFixed(4)} CRAP: ${sig.slice(0, 20)}...`);
      } catch (err) {
        logIssue("CLAIM", "Failed to claim winnings", { error: err.message, pendingWinnings });
      }
    }

  } catch (err) {
    logIssue("EPOCH_ERROR", `Epoch ${epochNum} failed`, { error: err.message });
    epochData.issues.push({ type: "EPOCH_ERROR", error: err.message });
  }

  epochData.endTime = new Date().toISOString();
  testResults.epochs.push(epochData);
  return epochData;
}

function analyzeEpochResults(epochData, wasComeOut, point, diceSum) {
  const { initialState, finalState, roll } = epochData;

  // Check if Pass Line bet was placed this epoch or existed before
  const passLinePlaced = epochData.betsPlaced.some(b => b.type === "PassLine");
  const hadPassLine = initialState.position?.passLine > 0n || passLinePlaced;

  // Analyze Pass Line bet
  if (wasComeOut && hadPassLine) {
    // Come-out phase with Pass Line bet
    if ([7, 11].includes(diceSum)) {
      // Natural - Pass Line WINS
      testResults.passLineBets.won++;
      testResults.totalWins++;
      console.log(`  Pass Line: WON - Natural ${diceSum}!`);
    } else if ([2, 3, 12].includes(diceSum)) {
      // Craps - Pass Line LOSES
      testResults.passLineBets.lost++;
      testResults.totalLosses++;
      console.log(`  Pass Line: LOST - Craps ${diceSum}!`);
    } else if ([4, 5, 6, 8, 9, 10].includes(diceSum)) {
      // Point established - bet stays active
      testResults.passLineBets.pending++;
      console.log(`  Pass Line: Point ${diceSum} established, bet stays active`);
    }
  } else if (!wasComeOut && hadPassLine) {
    // Point phase with active Pass Line
    if (diceSum === point) {
      // Point hit - Pass Line WINS
      testResults.passLineBets.won++;
      testResults.totalWins++;
      console.log(`  Pass Line: WON - Point ${point} hit!`);
    } else if (diceSum === 7) {
      // Seven-out - Pass Line LOSES
      testResults.passLineBets.lost++;
      testResults.totalLosses++;
      console.log(`  Pass Line: LOST - Seven-out!`);
    } else {
      // Neither point nor 7 - bet stays active (non-resolving roll)
      // No stats change needed
    }
  }

  // Analyze Field bet - check if a Field bet was placed this epoch (single-roll bets are cleared after settlement)
  const fieldBetPlaced = epochData.betsPlaced.some(b => b.type === "Field");
  const fieldWinNumbers = [2, 3, 4, 9, 10, 11, 12];
  if (fieldBetPlaced) {
    if (fieldWinNumbers.includes(diceSum)) {
      testResults.fieldBets.won++;
      testResults.totalWins++;
      console.log(`  Field: WON on ${diceSum}`);
    } else {
      testResults.fieldBets.lost++;
      testResults.totalLosses++;
      console.log(`  Field: LOST on ${diceSum}`);
    }
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("MULTI-EPOCH COMPREHENSIVE TEST");
  console.log("=".repeat(60));

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  // Load keypair
  const keypairPath = process.env.HOME + "/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const signer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log(`\nSigner: ${signer.publicKey.toBase58()}`);

  // Get initial balances
  const initialCrapBalance = await getTokenBalance(connection, CRAP_MINT, signer.publicKey);
  const initialRngBalance = await getTokenBalance(connection, RNG_MINT, signer.publicKey);
  console.log(`Initial CRAP Balance: ${initialCrapBalance.toFixed(4)}`);
  console.log(`Initial RNG Balance: ${initialRngBalance.toFixed(4)}`);

  // Check if we need more CRAP tokens
  if (initialCrapBalance < 0.5) {
    console.log("\nWarning: Low CRAP balance. May need to fund house or get tokens.");
  }

  // Run 5 epochs with varied rolls to test different scenarios
  const testScenarios = [
    { roll: 7, desc: "Come-out 7 (Pass Line wins)" },
    { roll: 4, desc: "Point establishment (4)" },
    { roll: 9, desc: "Non-resolving roll" },
    { roll: 4, desc: "Point hit (Pass Line wins)" },
    { roll: 7, desc: "Seven-out (Pass Line loses)" },
    { roll: null, desc: "Random roll" },
  ];

  for (let i = 0; i < testScenarios.length; i++) {
    const scenario = testScenarios[i];
    console.log(`\n>>> Scenario ${i + 1}: ${scenario.desc}`);
    await runEpochTest(connection, signer, i + 1, scenario.roll);
    await new Promise(r => setTimeout(r, 2000)); // Wait between epochs
  }

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("TEST SUMMARY");
  console.log("=".repeat(60));

  console.log(`\nTotal Epochs: ${testResults.epochs.length}`);
  console.log(`Total Bets: ${testResults.totalBets}`);
  console.log(`Total Wins: ${testResults.totalWins}`);
  console.log(`Total Losses: ${testResults.totalLosses}`);
  console.log(`Total P&L: ${testResults.totalPnL >= 0 ? "+" : ""}${testResults.totalPnL.toFixed(4)} CRAP`);

  console.log(`\nPass Line Stats:`);
  console.log(`  Placed: ${testResults.passLineBets.placed}`);
  console.log(`  Won: ${testResults.passLineBets.won}`);
  console.log(`  Lost: ${testResults.passLineBets.lost}`);
  console.log(`  Pending: ${testResults.passLineBets.pending}`);

  console.log(`\nField Bet Stats:`);
  console.log(`  Placed: ${testResults.fieldBets.placed}`);
  console.log(`  Won: ${testResults.fieldBets.won}`);
  console.log(`  Lost: ${testResults.fieldBets.lost}`);

  console.log(`\nIssues Found: ${testResults.issues.length}`);
  if (testResults.issues.length > 0) {
    console.log("\n--- Issues Detail ---");
    testResults.issues.forEach((issue, i) => {
      console.log(`${i + 1}. [${issue.category}] ${issue.description}`);
      if (Object.keys(issue.details).length > 0) {
        console.log(`   Details: ${JSON.stringify(issue.details)}`);
      }
    });
  } else {
    console.log("\nNo issues found!");
  }

  // Save results to file (with BigInt handling)
  const resultsFile = "multi-epoch-test-results.json";
  const replacer = (key, value) => typeof value === "bigint" ? value.toString() : value;
  fs.writeFileSync(resultsFile, JSON.stringify(testResults, replacer, 2));
  console.log(`\nResults saved to ${resultsFile}`);

  // Final balances
  const finalCrapBalance = await getTokenBalance(connection, CRAP_MINT, signer.publicKey);
  const finalRngBalance = await getTokenBalance(connection, RNG_MINT, signer.publicKey);
  console.log(`\nFinal CRAP Balance: ${finalCrapBalance.toFixed(4)} (change: ${(finalCrapBalance - initialCrapBalance).toFixed(4)})`);
  console.log(`Final RNG Balance: ${finalRngBalance.toFixed(4)}`);
}

main().catch(console.error);
