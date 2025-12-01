#!/usr/bin/env node
/**
 * Fund Craps House - Using @solana/web3.js
 *
 * First mints CRAP tokens to the admin, then calls FundCrapsHouse instruction
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
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import fs from "fs";

const LOCALNET_RPC = "http://127.0.0.1:8899";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const CRAP_MINT = new PublicKey("CRAPqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump");

// Instruction discriminators
const FUND_CRAPS_HOUSE = 26;

// PDAs
function crapsGamePDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("craps_game")], ORE_PROGRAM_ID);
}

function crapsVaultPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("craps_vault")], ORE_PROGRAM_ID);
}

function toLeBytes(n, len) {
  const arr = Buffer.alloc(len);
  arr.writeBigUInt64LE(BigInt(n), 0);
  return arr;
}

// Build FundCrapsHouse instruction
function createFundCrapsHouseInstruction(signer, amount) {
  const [crapsGameAddress] = crapsGamePDA();
  const [crapsVaultAddress] = crapsVaultPDA();

  const signerCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, signer);
  const vaultCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, crapsVaultAddress, true);

  const data = Buffer.alloc(9);
  data[0] = FUND_CRAPS_HOUSE;
  data.set(toLeBytes(amount, 8), 1);

  return new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: crapsGameAddress, isSigner: false, isWritable: true },
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

async function main() {
  console.log("============================================");
  console.log("FUNDING CRAPS HOUSE");
  console.log("============================================\n");

  const connection = new Connection(LOCALNET_RPC, "confirmed");

  // Load admin keypair
  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const admin = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log(`Admin: ${admin.publicKey.toBase58()}`);

  const [crapsGameAddress] = crapsGamePDA();
  const [crapsVaultAddress] = crapsVaultPDA();

  const signerCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, admin.publicKey);
  const vaultCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, crapsVaultAddress, true);

  console.log(`\nPDAs:`);
  console.log(`  CrapsGame: ${crapsGameAddress.toBase58()}`);
  console.log(`  CrapsVault: ${crapsVaultAddress.toBase58()}`);
  console.log(`  Admin CRAP ATA: ${signerCrapAta.toBase58()}`);
  console.log(`  Vault CRAP ATA: ${vaultCrapAta.toBase58()}`);

  // Step 1: Check if admin has CRAP ATA, create if not
  const adminAtaInfo = await connection.getAccountInfo(signerCrapAta);
  if (!adminAtaInfo) {
    console.log("\nCreating admin CRAP ATA...");
    const createAtaIx = createAssociatedTokenAccountInstruction(
      admin.publicKey,
      signerCrapAta,
      admin.publicKey,
      CRAP_MINT
    );
    const tx = new Transaction().add(createAtaIx);
    const sig = await sendAndConfirmTransaction(connection, tx, [admin]);
    console.log(`  Created! Signature: ${sig.slice(0, 40)}...`);
  } else {
    console.log("\nAdmin CRAP ATA exists");
  }

  // Step 2: Mint CRAP tokens to admin using spl-token CLI (admin is mint authority)
  console.log("\nMinting 1,000,000 CRAP to admin...");
  const { spawnSync } = await import("child_process");
  const mintResult = spawnSync("spl-token", [
    "mint", CRAP_MINT.toBase58(), "1000000",
    "--recipient-owner", admin.publicKey.toBase58(),
    "--url", LOCALNET_RPC
  ], { encoding: "utf-8" });

  if (mintResult.stderr && mintResult.stderr.includes("error")) {
    console.log(`  Mint result: ${mintResult.stderr.slice(0, 200)}`);
  } else {
    console.log(`  Minted! ${mintResult.stdout.match(/Signature: (\w+)/)?.[1]?.slice(0, 20) || "OK"}...`);
  }

  // Check balance
  try {
    const balance = await connection.getTokenAccountBalance(signerCrapAta);
    console.log(`  Admin CRAP balance: ${balance.value.uiAmount} CRAP`);
  } catch (e) {
    console.log(`  Could not get balance: ${e.message}`);
  }

  // Step 3: Fund the house with 100,000 CRAP
  const ONE_CRAP = BigInt(1_000_000_000); // 9 decimals
  const fundAmount = BigInt(100_000) * ONE_CRAP;

  console.log("\nFunding craps house with 100,000 CRAP...");

  const fundIx = createFundCrapsHouseInstruction(admin.publicKey, fundAmount);
  const tx = new Transaction().add(fundIx);

  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [admin]);
    console.log(`  SUCCESS! Signature: ${sig.slice(0, 40)}...`);
  } catch (e) {
    console.log(`  Error: ${e.message?.slice(0, 300)}`);
    if (e.logs) {
      console.log(`  Logs: ${e.logs.slice(-3).join("\n        ")}`);
    }
  }

  // Step 4: Verify
  const gameInfo = await connection.getAccountInfo(crapsGameAddress);
  if (gameInfo) {
    console.log("\nCrapsGame account:");
    console.log(`  Owner: ${gameInfo.owner.toBase58()}`);
    console.log(`  Data size: ${gameInfo.data.length} bytes`);

    // Parse house_bankroll (at offset 27 based on struct layout: 8 + 8 + 1 + 1 + 6 + 3)
    // Actually: discriminator(8) + epoch_id(8) + point(1) + is_come_out(1) + padding(6) + epoch_start_round(8) + house_bankroll(8)
    // = 8 + 8 + 1 + 1 + 6 + 8 + 8 = offset 40 for house_bankroll
    if (gameInfo.data.length >= 40) {
      const houseBankroll = gameInfo.data.readBigUInt64LE(32); // Try offset 32
      console.log(`  House bankroll (raw): ${houseBankroll}`);
      console.log(`  House bankroll: ${Number(houseBankroll) / Number(ONE_CRAP)} CRAP`);
    }
  } else {
    console.log("\nCrapsGame account NOT created!");
  }

  // Check vault balance
  try {
    const vaultBalance = await connection.getTokenAccountBalance(vaultCrapAta);
    console.log(`\nVault CRAP balance: ${vaultBalance.value.uiAmount} CRAP`);
  } catch (e) {
    console.log("\nVault CRAP ATA not created yet");
  }

  console.log("\n============================================");
  console.log("DONE");
  console.log("============================================");
}

main().catch(console.error);
