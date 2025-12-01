#!/usr/bin/env node
/**
 * Debug Pass Line Bet Flow
 *
 * This script tests the exact scenario:
 * 1. Place Pass Line bet during come-out
 * 2. Roll a point number (4)
 * 3. Check if pass_line is still active in position
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

const PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const CRAP_MINT = new PublicKey("7frAenkamJSASBH9YukkzBsSMz9paQdYuSGw4SjWkXrf");

const PLACE_CRAPS_BET_IX = 23;
const SETTLE_CRAPS_IX = 24;

const BetType = {
  PassLine: 0,
  DontPass: 1,
  Field: 10,
};

function boardPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("board")], PROGRAM_ID);
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

function roundPDA(roundId) {
  const idBytes = Buffer.alloc(8);
  idBytes.writeBigUInt64LE(roundId);
  return PublicKey.findProgramAddressSync([Buffer.from("round"), idBytes], PROGRAM_ID);
}

// Convert square to dice
function squareToDice(square) {
  const die1 = Math.floor(square / 6) + 1;
  const die2 = (square % 6) + 1;
  return [die1, die2];
}

// Generate winning square for a target sum
function sumToSquare(targetSum) {
  for (let d1 = 1; d1 <= 6; d1++) {
    for (let d2 = 1; d2 <= 6; d2++) {
      if (d1 + d2 === targetSum) {
        return (d1 - 1) * 6 + (d2 - 1);
      }
    }
  }
  throw new Error(`Invalid target sum: ${targetSum}`);
}

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

async function parseGameState(connection) {
  const [crapsGameAddress] = crapsGamePDA();
  const account = await connection.getAccountInfo(crapsGameAddress);
  if (!account) return null;

  const data = account.data;
  return {
    epochId: data.readBigUInt64LE(8),
    point: data.readUInt8(16),
    isComeOut: data.readUInt8(17) === 1,
    houseBankroll: data.readBigUInt64LE(32) / BigInt(1e9),
  };
}

async function parsePosition(connection, authority) {
  const [positionAddress] = crapsPositionPDA(authority);
  const account = await connection.getAccountInfo(positionAddress);
  if (!account) return null;

  const data = account.data;
  return {
    epochId: data.readBigUInt64LE(40),
    passLine: data.readBigUInt64LE(48),
    dontPass: data.readBigUInt64LE(56),
    pendingWinnings: data.readBigUInt64LE(280),
  };
}

async function main() {
  console.log("=== DEBUG PASS LINE BET FLOW ===\n");

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  const keypairPath = process.env.HOME + "/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const signer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log("Signer:", signer.publicKey.toBase58());

  // Get initial state
  console.log("\n--- INITIAL STATE ---");
  let gameState = await parseGameState(connection);
  let positionState = await parsePosition(connection, signer.publicKey);

  console.log("Game:", gameState);
  console.log("Position:", positionState);

  // Check if we're in come-out
  if (!gameState?.isComeOut) {
    console.log("\nNOT in come-out phase. Need to seven-out first.");
    console.log("Current point:", gameState?.point);

    // If we have no active bets, place a field bet first
    if (!positionState || (positionState.passLine === 0n && positionState.dontPass === 0n)) {
      console.log("\nPlacing Field bet to have an active bet...");
      const betAmount = BigInt(Math.floor(0.001 * 1e9));
      const placeBetIx = await buildPlaceBetInstruction(
        connection,
        signer.publicKey,
        BetType.Field,
        0,
        betAmount
      );
      const placeTx = new Transaction().add(placeBetIx);
      const placeSig = await sendAndConfirmTransaction(connection, placeTx, [signer], {
        commitment: "confirmed",
      });
      console.log("Field bet placed:", placeSig.slice(0, 20) + "...");
    }

    // Roll a 7 to seven-out and return to come-out
    console.log("\nRolling 7 to seven-out...");
    const [boardAddress] = boardPDA();
    const boardAccount = await connection.getAccountInfo(boardAddress);
    const roundId = boardAccount.data.readBigUInt64LE(8);

    const sevenSquare = sumToSquare(7);
    const settleIx = buildSettleCrapsInstruction(signer.publicKey, sevenSquare, roundId);
    const settleTx = new Transaction().add(settleIx);
    try {
      const settleSig = await sendAndConfirmTransaction(connection, settleTx, [signer], {
        commitment: "confirmed",
      });
      console.log("Seven-out complete:", settleSig.slice(0, 20) + "...");
    } catch (err) {
      console.log("Seven-out failed:", err.message);
    }

    // Re-check state
    gameState = await parseGameState(connection);
    positionState = await parsePosition(connection, signer.publicKey);
    console.log("\nAfter seven-out:");
    console.log("Game:", gameState);
    console.log("Position:", positionState);
  }

  if (!gameState?.isComeOut) {
    console.log("\nStill not in come-out. Cannot proceed.");
    return;
  }

  // Step 1: Place Pass Line bet
  console.log("\n--- STEP 1: PLACE PASS LINE BET ---");
  const betAmount = BigInt(Math.floor(0.01 * 1e9)); // 0.01 CRAP

  const placeBetIx = await buildPlaceBetInstruction(
    connection,
    signer.publicKey,
    BetType.PassLine,
    0,
    betAmount
  );

  const placeTx = new Transaction().add(placeBetIx);
  try {
    const placeSig = await sendAndConfirmTransaction(connection, placeTx, [signer], {
      commitment: "confirmed",
    });
    console.log("Pass Line bet placed:", placeSig);
  } catch (err) {
    console.error("Failed to place bet:", err.message);
    if (err.logs) {
      err.logs.forEach(l => console.log(l));
    }
    return;
  }

  // Check state after placing bet
  positionState = await parsePosition(connection, signer.publicKey);
  console.log("\nAfter placing bet:");
  console.log("Position passLine:", Number(positionState?.passLine) / 1e9, "CRAP");

  // Step 2: Roll a point number (4)
  console.log("\n--- STEP 2: ROLL POINT NUMBER (4) ---");
  const [boardAddress] = boardPDA();
  let boardAccount = await connection.getAccountInfo(boardAddress);
  let roundId = boardAccount.data.readBigUInt64LE(8);

  const winningSquare = sumToSquare(4); // Roll a 4
  const [die1, die2] = squareToDice(winningSquare);
  console.log(`Rolling: ${die1}+${die2}=4`);

  const settleIx = buildSettleCrapsInstruction(signer.publicKey, winningSquare, roundId);
  const settleTx = new Transaction().add(settleIx);

  try {
    const settleSig = await sendAndConfirmTransaction(connection, settleTx, [signer], {
      commitment: "confirmed",
    });
    console.log("Settle SUCCESS:", settleSig);
  } catch (err) {
    console.error("Settle failed:", err.message);
    if (err.logs) {
      console.log("\nProgram logs:");
      err.logs.forEach(l => console.log(l));
    }
    return;
  }

  // Step 3: Check state after rolling point
  console.log("\n--- STEP 3: CHECK STATE AFTER POINT ROLL ---");
  gameState = await parseGameState(connection);
  positionState = await parsePosition(connection, signer.publicKey);

  console.log("\nGame state:");
  console.log("  - Point:", gameState?.point);
  console.log("  - Is come-out:", gameState?.isComeOut);

  console.log("\nPosition state:");
  console.log("  - Pass Line:", Number(positionState?.passLine) / 1e9, "CRAP");
  console.log("  - Don't Pass:", Number(positionState?.dontPass) / 1e9, "CRAP");
  console.log("  - Pending Winnings:", Number(positionState?.pendingWinnings) / 1e9, "CRAP");

  // CRITICAL CHECK
  if (positionState?.passLine > 0n) {
    console.log("\n=== PASS LINE BET IS STILL ACTIVE - CORRECT BEHAVIOR ===");
  } else {
    console.log("\n=== PASS LINE BET IS GONE - THIS IS THE BUG ===");
    console.log("Expected: pass_line should remain active after point establishment");
    console.log("Actual: pass_line is 0");
  }
}

main().catch(console.error);
