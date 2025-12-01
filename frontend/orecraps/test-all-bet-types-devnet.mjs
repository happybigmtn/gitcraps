#!/usr/bin/env node
/**
 * Comprehensive Devnet Bet Type Test
 *
 * Tests all craps bet types on devnet with localnet feature enabled.
 * Each bet type is placed, then settled with a random or targeted roll.
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
} from "@solana/spl-token";
import * as fs from "fs";
import crypto from "crypto";

const PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const CRAP_MINT = new PublicKey("7frAenkamJSASBH9YukkzBsSMz9paQdYuSGw4SjWkXrf");

// Instruction discriminators
const PLACE_CRAPS_BET_IX = 23;
const SETTLE_CRAPS_IX = 24;
const CLAIM_CRAPS_WINNINGS_IX = 25;

// Bet types
const BetType = {
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
  BonusSmall: 16,
  BonusTall: 17,
  BonusAll: 18,
  FireBet: 19,
  DiffDoubles: 20,
  RideTheLine: 21,
  MugsyCorner: 22,
  HotHand: 23,
  ReplayBet: 24,
  FieldersChoice: 25,
};

// Bet type names
const BetTypeName = {
  0: "Pass Line",
  1: "Don't Pass",
  2: "Pass Odds",
  3: "Don't Pass Odds",
  4: "Come",
  5: "Don't Come",
  6: "Come Odds",
  7: "Don't Come Odds",
  8: "Place",
  9: "Hardway",
  10: "Field",
  11: "Any Seven",
  12: "Any Craps",
  13: "Yo Eleven",
  14: "Aces",
  15: "Twelve",
  16: "Bonus Small",
  17: "Bonus Tall",
  18: "Bonus All",
  19: "Fire Bet",
  20: "Diff Doubles",
  21: "Ride The Line",
  22: "Mugsy Corner",
  23: "Hot Hand",
  24: "Replay Bet",
  25: "Fielders Choice",
};

// PDAs
function boardPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("board")], PROGRAM_ID);
}

function crapsGamePDA() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("craps_game")],
    PROGRAM_ID
  );
}

function crapsPositionPDA(authority) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("craps_position"), authority.toBuffer()],
    PROGRAM_ID
  );
}

function crapsVaultPDA() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("craps_vault")],
    PROGRAM_ID
  );
}

function roundPDA(roundId) {
  const idBytes = Buffer.alloc(8);
  idBytes.writeBigUInt64LE(roundId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("round"), idBytes],
    PROGRAM_ID
  );
}

// Convert square index to dice values
function squareToDice(square) {
  const die1 = Math.floor(square / 6) + 1;
  const die2 = (square % 6) + 1;
  return [die1, die2];
}

// Generate random winning square
function generateRandomSquare() {
  const randomBytes = crypto.randomBytes(8);
  const sample = randomBytes.readBigUInt64LE(0);
  return Number(sample % 36n);
}

// Generate winning square for specific dice sum
function diceToSquare(die1, die2) {
  return (die1 - 1) * 6 + (die2 - 1);
}

// Generate winning square for a target sum
function sumToSquare(targetSum) {
  // Find a dice combination for this sum
  for (let d1 = 1; d1 <= 6; d1++) {
    for (let d2 = 1; d2 <= 6; d2++) {
      if (d1 + d2 === targetSum) {
        return diceToSquare(d1, d2);
      }
    }
  }
  throw new Error(`Invalid target sum: ${targetSum}`);
}

// Build PlaceCrapsBet instruction
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
      { pubkey: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"), isSigner: false, isWritable: false },
    ],
    data,
  });
}

// Build SettleCraps instruction
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

// Test results storage
const testResults = [];

async function placeBetAndSettle(connection, signer, betType, point, amount, targetSum = null) {
  const betName = BetTypeName[betType] + (point > 0 ? ` (${point})` : "");
  console.log(`\n--- Testing: ${betName} ---`);

  try {
    // Place bet
    const placeBetIx = await buildPlaceBetInstruction(
      connection,
      signer.publicKey,
      betType,
      point,
      amount
    );

    const placeTx = new Transaction().add(placeBetIx);
    const placeSig = await sendAndConfirmTransaction(connection, placeTx, [signer], {
      commitment: "confirmed",
    });
    console.log(`  PlaceBet SUCCESS: ${placeSig.slice(0, 20)}...`);

    // Get round ID
    const [boardAddress] = boardPDA();
    const boardAccount = await connection.getAccountInfo(boardAddress);
    const roundId = boardAccount.data.readBigUInt64LE(8);

    // Settle with targeted or random roll
    let winningSquare;
    if (targetSum !== null) {
      winningSquare = sumToSquare(targetSum);
    } else {
      winningSquare = generateRandomSquare();
    }

    const [die1, die2] = squareToDice(winningSquare);
    console.log(`  Rolling: ${die1}+${die2}=${die1 + die2}`);

    const settleCrapsIx = buildSettleCrapsInstruction(
      signer.publicKey,
      winningSquare,
      roundId
    );

    const settleTx = new Transaction().add(settleCrapsIx);
    const settleSig = await sendAndConfirmTransaction(connection, settleTx, [signer], {
      commitment: "confirmed",
    });
    console.log(`  SettleCraps SUCCESS: ${settleSig.slice(0, 20)}...`);

    testResults.push({ bet: betName, placeBet: "SUCCESS", settle: "SUCCESS", roll: `${die1}+${die2}` });
    return true;
  } catch (err) {
    console.error(`  FAILED: ${err.message}`);
    if (err.logs) {
      const relevantLog = err.logs.find(l => l.includes("Program log:") && !l.includes("invoke"));
      if (relevantLog) console.error(`  Log: ${relevantLog}`);
    }
    testResults.push({ bet: betName, placeBet: "FAILED", settle: "N/A", error: err.message.slice(0, 50) });
    return false;
  }
}

async function main() {
  console.log("=== COMPREHENSIVE DEVNET BET TYPE TEST ===\n");

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  const keypairPath = process.env.HOME + "/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const signer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log("Signer:", signer.publicKey.toBase58());

  const betAmount = BigInt(Math.floor(0.001 * 1e9)); // 0.001 CRAP per bet

  // Test Line Bets (come-out only)
  console.log("\n========== LINE BETS ==========");
  await placeBetAndSettle(connection, signer, BetType.PassLine, 0, betAmount, 7); // Win
  await placeBetAndSettle(connection, signer, BetType.DontPass, 0, betAmount, 7); // Lose

  // Test Place Bets (point numbers)
  console.log("\n========== PLACE BETS ==========");
  for (const point of [4, 5, 6, 8, 9, 10]) {
    await placeBetAndSettle(connection, signer, BetType.Place, point, betAmount, point); // Win
  }

  // Test Prop Bets (single roll)
  console.log("\n========== PROP BETS ==========");
  await placeBetAndSettle(connection, signer, BetType.Field, 0, betAmount, 3); // Win (2,3,4,9,10,11,12)
  await placeBetAndSettle(connection, signer, BetType.AnySeven, 0, betAmount, 7); // Win
  await placeBetAndSettle(connection, signer, BetType.AnyCraps, 0, betAmount, 2); // Win (2,3,12)
  await placeBetAndSettle(connection, signer, BetType.YoEleven, 0, betAmount, 11); // Win
  await placeBetAndSettle(connection, signer, BetType.Aces, 0, betAmount, 2); // Win
  await placeBetAndSettle(connection, signer, BetType.Twelve, 0, betAmount, 12); // Win

  // Test Hardways
  console.log("\n========== HARDWAY BETS ==========");
  for (const hardway of [4, 6, 8, 10]) {
    // Hardway needs exact dice match (e.g., hard 4 = 2+2)
    const half = hardway / 2;
    const hardSquare = diceToSquare(half, half);
    console.log(`\n--- Testing: Hardway ${hardway} ---`);
    try {
      const placeBetIx = await buildPlaceBetInstruction(
        connection,
        signer.publicKey,
        BetType.Hardway,
        hardway,
        betAmount
      );
      const placeTx = new Transaction().add(placeBetIx);
      const placeSig = await sendAndConfirmTransaction(connection, placeTx, [signer], {
        commitment: "confirmed",
      });
      console.log(`  PlaceBet SUCCESS: ${placeSig.slice(0, 20)}...`);

      const [boardAddress] = boardPDA();
      const boardAccount = await connection.getAccountInfo(boardAddress);
      const roundId = boardAccount.data.readBigUInt64LE(8);

      const [die1, die2] = squareToDice(hardSquare);
      console.log(`  Rolling: ${die1}+${die2}=${die1 + die2} (hardway)`);

      const settleCrapsIx = buildSettleCrapsInstruction(
        signer.publicKey,
        hardSquare,
        roundId
      );
      const settleTx = new Transaction().add(settleCrapsIx);
      const settleSig = await sendAndConfirmTransaction(connection, settleTx, [signer], {
        commitment: "confirmed",
      });
      console.log(`  SettleCraps SUCCESS: ${settleSig.slice(0, 20)}...`);
      testResults.push({ bet: `Hardway ${hardway}`, placeBet: "SUCCESS", settle: "SUCCESS", roll: `${die1}+${die2}` });
    } catch (err) {
      console.error(`  FAILED: ${err.message.slice(0, 80)}`);
      testResults.push({ bet: `Hardway ${hardway}`, placeBet: "FAILED", settle: "N/A", error: err.message.slice(0, 50) });
    }
  }

  // Test Side Bets (come-out only)
  console.log("\n========== SIDE BETS (Come-out only) ==========");

  // Fire Bet
  await placeBetAndSettle(connection, signer, BetType.FireBet, 0, betAmount, null);

  // Diff Doubles
  await placeBetAndSettle(connection, signer, BetType.DiffDoubles, 0, betAmount, null);

  // Ride The Line
  await placeBetAndSettle(connection, signer, BetType.RideTheLine, 0, betAmount, null);

  // Mugsy Corner
  await placeBetAndSettle(connection, signer, BetType.MugsyCorner, 0, betAmount, null);

  // Hot Hand
  await placeBetAndSettle(connection, signer, BetType.HotHand, 0, betAmount, null);

  // Replay Bet
  await placeBetAndSettle(connection, signer, BetType.ReplayBet, 0, betAmount, null);

  // Fielders Choice (3 sub-types)
  for (let subBet = 0; subBet <= 2; subBet++) {
    await placeBetAndSettle(connection, signer, BetType.FieldersChoice, subBet, betAmount, null);
  }

  // Summary
  console.log("\n\n========== TEST SUMMARY ==========\n");
  const passed = testResults.filter(r => r.settle === "SUCCESS").length;
  const failed = testResults.filter(r => r.settle !== "SUCCESS").length;

  console.log(`PASSED: ${passed}/${testResults.length}`);
  console.log(`FAILED: ${failed}/${testResults.length}`);
  console.log("\n--- Details ---");

  testResults.forEach(r => {
    const status = r.settle === "SUCCESS" ? "✓" : "✗";
    const detail = r.error ? `(${r.error})` : r.roll ? `(${r.roll})` : "";
    console.log(`${status} ${r.bet}: ${r.placeBet}/${r.settle} ${detail}`);
  });
}

main().catch(console.error);
