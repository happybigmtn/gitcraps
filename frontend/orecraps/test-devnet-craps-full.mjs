#!/usr/bin/env node
/**
 * Complete Devnet Craps Test
 *
 * Tests the full flow: PlaceBet -> Roll -> SettleCraps -> ClaimWinnings
 *
 * The devnet program has been deployed with `localnet` feature which
 * bypasses RNG validation, allowing settlement with any winning_square.
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
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";
import crypto from "crypto";

const PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const CRAP_MINT = new PublicKey("7frAenkamJSASBH9YukkzBsSMz9paQdYuSGw4SjWkXrf");

// Instruction discriminators (from ore_api)
const PLACE_CRAPS_BET_IX = 23;
const SETTLE_CRAPS_IX = 24;
const CLAIM_CRAPS_WINNINGS_IX = 25;
const START_ROUND_IX = 22;

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

// PDAs
function boardPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("board")], PROGRAM_ID);
}

function configPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
}

function roundPDA(roundId) {
  const idBytes = Buffer.alloc(8);
  idBytes.writeBigUInt64LE(roundId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("round"), idBytes],
    PROGRAM_ID
  );
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

// Craps vault PDA
function crapsVaultPDA() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("craps_vault")],
    PROGRAM_ID
  );
}

// Build PlaceCrapsBet instruction
async function buildPlaceBetInstruction(connection, signer, betType, point, amount) {
  const [crapsGameAddress] = crapsGamePDA();
  const [crapsPositionAddress] = crapsPositionPDA(signer);
  const [crapsVaultAddress] = crapsVaultPDA();

  // Get token accounts
  const signerCrapAta = await getAssociatedTokenAddress(CRAP_MINT, signer);
  const vaultCrapAta = await getAssociatedTokenAddress(CRAP_MINT, crapsVaultAddress, true);

  // Data: discriminator (1) + bet_type (1) + point (1) + _padding (6) + amount (8)
  const data = Buffer.alloc(17);
  data.writeUInt8(PLACE_CRAPS_BET_IX, 0);
  data.writeUInt8(betType, 1);
  data.writeUInt8(point, 2);
  // padding is already zeros
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

  // Data: discriminator (1) + winning_square (8)
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

// Build ClaimCrapsWinnings instruction
function buildClaimWinningsInstruction(signer) {
  const [crapsGameAddress] = crapsGamePDA();
  const [crapsPositionAddress] = crapsPositionPDA(signer);
  const signerCrapAta = getAssociatedTokenAddress(CRAP_MINT, signer);
  const gameVaultAta = getAssociatedTokenAddress(CRAP_MINT, crapsGameAddress, true);

  // Data: discriminator (1)
  const data = Buffer.alloc(1);
  data.writeUInt8(CLAIM_CRAPS_WINNINGS_IX, 0);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: crapsGameAddress, isSigner: false, isWritable: true },
      { pubkey: crapsPositionAddress, isSigner: false, isWritable: true },
    ],
    data,
  });
}

// Build StartRound instruction (admin only)
function buildStartRoundInstruction(signer, duration) {
  const [boardAddress] = boardPDA();
  const [configAddress] = configPDA();
  const [, roundId] = getCurrentRoundIdSync(null); // We'll need to get this

  // Data: discriminator (1) + duration (8)
  const data = Buffer.alloc(9);
  data.writeUInt8(START_ROUND_IX, 0);
  data.writeBigUInt64LE(BigInt(duration), 1);

  return async (connection) => {
    const boardAccount = await connection.getAccountInfo(boardAddress);
    const currentRoundId = boardAccount.data.readBigUInt64LE(8);
    const [roundAddress] = roundPDA(currentRoundId);

    return new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: signer, isSigner: true, isWritable: true },
        { pubkey: boardAddress, isSigner: false, isWritable: true },
        { pubkey: configAddress, isSigner: false, isWritable: false },
        { pubkey: roundAddress, isSigner: false, isWritable: true },
      ],
      data,
    });
  };
}

async function main() {
  console.log("=== DEVNET CRAPS FULL TEST ===\n");

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  // Load admin keypair
  const keypairPath = process.env.HOME + "/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const signer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log("Signer:", signer.publicKey.toBase58());

  // Get board info
  const [boardAddress] = boardPDA();
  const boardAccount = await connection.getAccountInfo(boardAddress);

  if (!boardAccount) {
    console.error("Board not found! Program may not be initialized.");
    return;
  }

  const roundId = boardAccount.data.readBigUInt64LE(8);
  const startSlot = boardAccount.data.readBigUInt64LE(16);
  const endSlot = boardAccount.data.readBigUInt64LE(24);
  const currentSlot = await connection.getSlot();

  console.log("\n--- Round Status ---");
  console.log("Round ID:", roundId.toString());
  console.log("Start Slot:", startSlot.toString());
  console.log("End Slot:", endSlot.toString());
  console.log("Current Slot:", currentSlot);
  console.log("Round Active:", currentSlot >= startSlot && currentSlot < endSlot);

  // Check if round needs to be started
  if (endSlot <= currentSlot || startSlot === 0n || endSlot === BigInt("18446744073709551615")) {
    console.log("\n--- Starting New Round ---");

    const [configAddress] = configPDA();
    const configAccount = await connection.getAccountInfo(configAddress);
    const configAdmin = new PublicKey(configAccount.data.subarray(8, 40));

    if (!configAdmin.equals(signer.publicKey)) {
      console.log("Warning: Signer is not admin. Cannot start round.");
      console.log("Admin:", configAdmin.toBase58());
      console.log("Signer:", signer.publicKey.toBase58());
    } else {
      const [roundAddress] = roundPDA(roundId);
      const roundDuration = 1000n; // 1000 slots (~6.7 minutes)

      const startRoundData = Buffer.alloc(9);
      startRoundData.writeUInt8(START_ROUND_IX, 0);
      startRoundData.writeBigUInt64LE(roundDuration, 1);

      const startRoundIx = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: signer.publicKey, isSigner: true, isWritable: true },
          { pubkey: boardAddress, isSigner: false, isWritable: true },
          { pubkey: configAddress, isSigner: false, isWritable: false },
          { pubkey: roundAddress, isSigner: false, isWritable: true },
        ],
        data: startRoundData,
      });

      try {
        const tx = new Transaction().add(startRoundIx);
        const sig = await sendAndConfirmTransaction(connection, tx, [signer], {
          commitment: "confirmed",
        });
        console.log("StartRound SUCCESS! Signature:", sig);

        // Refresh board info
        const newBoardAccount = await connection.getAccountInfo(boardAddress);
        const newEndSlot = newBoardAccount.data.readBigUInt64LE(24);
        console.log("New end slot:", newEndSlot.toString());
      } catch (err) {
        console.error("StartRound failed:", err.message);
        if (err.logs) {
          console.log("\nProgram logs:");
          err.logs.forEach((log) => console.log(log));
        }
      }
    }
  }

  // Check CRAP balance
  const signerCrapAta = await getAssociatedTokenAddress(
    CRAP_MINT,
    signer.publicKey
  );
  let crapBalance = 0;

  try {
    const ataInfo = await connection.getTokenAccountBalance(signerCrapAta);
    crapBalance = Number(ataInfo.value.amount) / 1e9;
    console.log("\n--- Token Balances ---");
    console.log("CRAP balance:", crapBalance);
  } catch {
    console.log("\nNo CRAP token account. Creating one...");

    try {
      const createAtaIx = createAssociatedTokenAccountInstruction(
        signer.publicKey,
        signerCrapAta,
        signer.publicKey,
        CRAP_MINT
      );

      const tx = new Transaction().add(createAtaIx);
      await sendAndConfirmTransaction(connection, tx, [signer], {
        commitment: "confirmed",
      });
      console.log("Created CRAP ATA:", signerCrapAta.toBase58());
    } catch (err) {
      console.log("Failed to create ATA:", err.message);
    }
  }

  // Check position
  const [crapsPositionAddress] = crapsPositionPDA(signer.publicKey);
  const positionAccount = await connection.getAccountInfo(crapsPositionAddress);

  if (!positionAccount) {
    console.log("\nNo craps position found. Will be created on first bet.");
  } else {
    console.log("\n--- Position Status ---");
    console.log("Position Address:", crapsPositionAddress.toBase58());
    console.log("Data length:", positionAccount.data.length);

    // Parse some position data
    // offset 8: authority (32 bytes)
    // offset 40: epoch_id (8 bytes)
    // offset 48: pass_line (8 bytes)
    // offset 56: dont_pass (8 bytes)
    const epochId = positionAccount.data.readBigUInt64LE(40);
    const passLine = positionAccount.data.readBigUInt64LE(48);
    const dontPass = positionAccount.data.readBigUInt64LE(56);
    console.log("Epoch ID:", epochId.toString());
    console.log("Pass Line:", Number(passLine) / 1e9);
    console.log("Don't Pass:", Number(dontPass) / 1e9);
  }

  // Test: Place a bet
  if (crapBalance >= 0.01) {
    console.log("\n=== TEST: PLACE PASS LINE BET ===");

    const betAmount = BigInt(Math.floor(0.01 * 1e9)); // 0.01 CRAP

    try {
      const placeBetIx = await buildPlaceBetInstruction(
        connection,
        signer.publicKey,
        BetType.PassLine,
        0,
        betAmount
      );

      const tx = new Transaction().add(placeBetIx);
      const sig = await sendAndConfirmTransaction(connection, tx, [signer], {
        commitment: "confirmed",
      });
      console.log("PlaceBet SUCCESS! Signature:", sig);
    } catch (err) {
      console.error("PlaceBet failed:", err.message);
      if (err.logs) {
        console.log("\nProgram logs:");
        err.logs.forEach((log) => console.log(log));
      }
    }
  } else {
    console.log("\nInsufficient CRAP balance for betting.");
    console.log("Use: spl-token mint", CRAP_MINT.toBase58(), "1 --recipient-owner", signer.publicKey.toBase58(), "--url devnet");
  }

  // Test: Settle with random roll
  console.log("\n=== TEST: SETTLE CRAPS ===");

  const winningSquare = generateRandomSquare();
  const [die1, die2] = squareToDice(winningSquare);
  console.log(`Random roll: ${die1}+${die2}=${die1 + die2} (square ${winningSquare})`);

  // Refresh round ID
  const newBoardAccount = await connection.getAccountInfo(boardAddress);
  const currentRoundId = newBoardAccount.data.readBigUInt64LE(8);

  try {
    const settleCrapsIx = buildSettleCrapsInstruction(
      signer.publicKey,
      winningSquare,
      currentRoundId
    );

    const tx = new Transaction().add(settleCrapsIx);
    const sig = await sendAndConfirmTransaction(connection, tx, [signer], {
      commitment: "confirmed",
    });
    console.log("SettleCraps SUCCESS! Signature:", sig);
    console.log("\n>>> localnet feature is working! RNG validation bypassed <<<");
  } catch (err) {
    console.error("SettleCraps failed:", err.message);
    if (err.logs) {
      console.log("\nProgram logs:");
      err.logs.forEach((log) => console.log(log));
    }

    if (err.message.includes("Round has no valid RNG")) {
      console.log("\n>>> localnet feature NOT enabled - RNG validation active <<<");
    }
  }

  console.log("\n=== TEST COMPLETE ===");
}

main().catch(console.error);
