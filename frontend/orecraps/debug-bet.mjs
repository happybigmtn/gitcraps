#!/usr/bin/env node
/**
 * Debug script to test a single bet and print detailed error
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

const LOCALNET_RPC = "http://127.0.0.1:8899";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const CRAP_MINT = new PublicKey("CRAPqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump");

// Instruction discriminators
const INITIALIZE = 1;
const FUND_CRAPS_HOUSE = 26;
const PLACE_CRAPS_BET = 23;

const ONE_CRAP = BigInt(1_000_000_000);

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

async function loadAdmin() {
  const keyPath = "/home/r/.config/solana/id.json";
  const secretKey = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

async function main() {
  const connection = new Connection(LOCALNET_RPC, "confirmed");
  const admin = await loadAdmin();

  console.log("Admin:", admin.publicKey.toBase58());
  console.log("Program ID:", ORE_PROGRAM_ID.toBase58());
  console.log("CRAP Mint:", CRAP_MINT.toBase58());

  // Check if board exists
  const [boardAddress] = boardPDA();
  const boardInfo = await connection.getAccountInfo(boardAddress);
  console.log("\nBoard account:", boardAddress.toBase58());
  console.log("Board exists:", !!boardInfo);

  if (!boardInfo) {
    // Initialize the board first
    console.log("\nInitializing board...");
    const [configAddress] = configPDA();
    const [treasuryAddress] = treasuryPDA();
    const [roundAddress] = roundPDA(0);

    const initData = Buffer.alloc(1);
    initData[0] = INITIALIZE;

    const initIx = new TransactionInstruction({
      keys: [
        { pubkey: admin.publicKey, isSigner: true, isWritable: true },
        { pubkey: boardAddress, isSigner: false, isWritable: true },
        { pubkey: configAddress, isSigner: false, isWritable: true },
        { pubkey: treasuryAddress, isSigner: false, isWritable: true },
        { pubkey: roundAddress, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: ORE_PROGRAM_ID,
      data: initData,
    });

    try {
      const initTx = new Transaction().add(initIx);
      const sig = await sendAndConfirmTransaction(connection, initTx, [admin]);
      console.log("Board initialized:", sig);
    } catch (e) {
      console.error("Initialize failed:", e.message);
      process.exit(1);
    }
  }

  // Check if crapsGame exists
  const [crapsGameAddress] = crapsGamePDA();
  const [crapsVaultAddress] = crapsVaultPDA();
  const crapsGameInfo = await connection.getAccountInfo(crapsGameAddress);
  console.log("\nCraps Game account:", crapsGameAddress.toBase58());
  console.log("Craps Vault account:", crapsVaultAddress.toBase58());
  console.log("Craps Game exists:", !!crapsGameInfo);

  // Check admin's CRAP balance
  const adminCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, admin.publicKey);
  console.log("\nAdmin CRAP ATA:", adminCrapAta.toBase58());

  try {
    const balance = await connection.getTokenAccountBalance(adminCrapAta);
    console.log("Admin CRAP balance:", balance.value.uiAmount);
  } catch (e) {
    console.log("Admin CRAP ATA does not exist - need to create and mint");

    // Create admin's ATA
    const createAtaIx = createAssociatedTokenAccountInstruction(
      admin.publicKey,
      adminCrapAta,
      admin.publicKey,
      CRAP_MINT
    );
    const ataTx = new Transaction().add(createAtaIx);
    try {
      await sendAndConfirmTransaction(connection, ataTx, [admin]);
      console.log("Created admin ATA");
    } catch (e) {
      console.log("Failed to create ATA:", e.message);
    }

    // Mint tokens
    console.log("\nPlease mint CRAP tokens to admin first:");
    console.log(`spl-token mint ${CRAP_MINT.toBase58()} 1000000000 ${adminCrapAta.toBase58()} --url localhost`);
    process.exit(1);
  }

  // Fund craps house if not funded
  if (!crapsGameInfo) {
    console.log("\nFunding craps house...");
    const vaultCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, crapsVaultAddress, true);
    console.log("Vault CRAP ATA:", vaultCrapAta.toBase58());

    const fundAmount = BigInt(1000000) * ONE_CRAP;  // 1M CRAP
    const fundData = Buffer.alloc(9);
    fundData[0] = FUND_CRAPS_HOUSE;
    fundData.writeBigUInt64LE(fundAmount, 1);

    const fundIx = new TransactionInstruction({
      keys: [
        { pubkey: admin.publicKey, isSigner: true, isWritable: true },
        { pubkey: crapsGameAddress, isSigner: false, isWritable: true },
        { pubkey: crapsVaultAddress, isSigner: false, isWritable: false },
        { pubkey: adminCrapAta, isSigner: false, isWritable: true },
        { pubkey: vaultCrapAta, isSigner: false, isWritable: true },
        { pubkey: CRAP_MINT, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: ORE_PROGRAM_ID,
      data: fundData,
    });

    try {
      const fundTx = new Transaction().add(fundIx);
      const sig = await sendAndConfirmTransaction(connection, fundTx, [admin]);
      console.log("House funded:", sig);
    } catch (e) {
      console.error("Fund house failed:", e);
      console.error("Logs:", e.logs);
      process.exit(1);
    }
  }

  // Try to place a single bet
  console.log("\n--- PLACING TEST BET ---");
  const [crapsPositionAddress] = crapsPositionPDA(admin.publicKey);
  const vaultCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, crapsVaultAddress, true);

  console.log("Position PDA:", crapsPositionAddress.toBase58());
  console.log("Admin CRAP ATA:", adminCrapAta.toBase58());
  console.log("Vault CRAP ATA:", vaultCrapAta.toBase58());

  // Build instruction data
  const betAmount = BigInt(100) * ONE_CRAP;  // 100 CRAP
  const betType = 0;  // PassLine
  const point = 0;

  const data = Buffer.alloc(17);
  data[0] = PLACE_CRAPS_BET;  // 23
  data[1] = betType;
  data[2] = point;
  // data[3-8] = padding (zeros)
  data.writeBigUInt64LE(betAmount, 9);

  console.log("\nInstruction data (hex):", data.toString("hex"));
  console.log("  Discriminator:", data[0]);
  console.log("  Bet type:", data[1]);
  console.log("  Point:", data[2]);
  console.log("  Amount:", betAmount.toString());

  const betIx = new TransactionInstruction({
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: crapsGameAddress, isSigner: false, isWritable: true },
      { pubkey: crapsPositionAddress, isSigner: false, isWritable: true },
      { pubkey: crapsVaultAddress, isSigner: false, isWritable: false },
      { pubkey: adminCrapAta, isSigner: false, isWritable: true },
      { pubkey: vaultCrapAta, isSigner: false, isWritable: true },
      { pubkey: CRAP_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data,
  });

  console.log("\nSending bet transaction...");
  try {
    const tx = new Transaction().add(betIx);
    const sig = await sendAndConfirmTransaction(connection, tx, [admin], {
      commitment: "confirmed",
    });
    console.log("✓ Bet placed successfully:", sig);

    // Check new balance
    const newBalance = await connection.getTokenAccountBalance(adminCrapAta);
    console.log("New CRAP balance:", newBalance.value.uiAmount);
  } catch (e) {
    console.error("\n✗ Bet FAILED!");
    console.error("Error:", e.message);
    if (e.logs) {
      console.error("\nProgram logs:");
      e.logs.forEach(log => console.error("  ", log));
    }
    process.exit(1);
  }

  console.log("\n✓ All tests passed!");
}

main().catch(console.error);
