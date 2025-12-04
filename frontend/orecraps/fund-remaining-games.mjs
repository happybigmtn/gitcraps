#!/usr/bin/env node
/**
 * Fund remaining games: Three Card Poker and Video Poker
 */
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress
} from "@solana/spl-token";
import fs from "fs";

const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");

// Devnet mints
const TCP_MINT = new PublicKey("3UTs2U6ps5z1asibwgtCZAtbatuKGcqX85QJ7zZBvvth");
const VPK_MINT = new PublicKey("GNPiaDCr18GZ4PKcHDEFuAXkisBpN2aosBruqNAdXT2W");

function findPDA(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

async function fundVideoPoker(connection, admin) {
  console.log(`\n=== Video Poker ===`);

  const [gameAddress] = findPDA([Buffer.from("video_poker_game")], ORE_PROGRAM_ID);
  const [vaultAddress] = findPDA([Buffer.from("video_poker_vault")], ORE_PROGRAM_ID);

  console.log(`Game PDA: ${gameAddress.toBase58()}`);
  console.log(`Vault PDA: ${vaultAddress.toBase58()}`);

  const signerAta = await getAssociatedTokenAddress(VPK_MINT, admin.publicKey);
  const vaultAta = await getAssociatedTokenAddress(VPK_MINT, vaultAddress, true);

  console.log(`Signer ATA: ${signerAta.toBase58()}`);
  console.log(`Vault ATA: ${vaultAta.toBase58()}`);

  // Check balances
  try {
    const balance = await connection.getTokenAccountBalance(signerAta);
    console.log(`Signer balance: ${balance.value.uiAmount}`);
  } catch (e) {
    console.log("No token balance found for signer");
    return false;
  }

  // Build fund instruction - Video Poker has 9 accounts including mint
  const amount = BigInt(1_000) * BigInt(1_000_000_000); // 1k tokens
  const data = Buffer.alloc(9);
  data[0] = 68; // FundVideoPokerHouse discriminator
  data.writeBigUInt64LE(amount, 1);

  // Account layout per program/src/videopoker/fund_house.rs:
  // 0: signer (admin)
  // 1: video_poker_game - game state PDA
  // 2: video_poker_vault - vault PDA
  // 3: signer_vpk_ata - signer's VPK token account
  // 4: vault_vpk_ata - video poker vault's VPK token account
  // 5: vpk_mint - VPK token mint
  // 6: system_program
  // 7: token_program
  // 8: associated_token_program
  const instruction = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: false },
      { pubkey: signerAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: VPK_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(instruction);
  tx.feePayer = admin.publicKey;

  console.log("Simulating transaction...");
  const simulation = await connection.simulateTransaction(tx, [admin]);

  if (simulation.value.err) {
    console.log("Simulation failed:", JSON.stringify(simulation.value.err));
    simulation.value.logs?.forEach(log => console.log("  ", log));
    return false;
  }

  console.log("Simulation passed! Sending...");
  const sig = await sendAndConfirmTransaction(connection, tx, [admin], {
    skipPreflight: false,
    commitment: "confirmed"
  });
  console.log(`SUCCESS! Signature: ${sig}`);
  return true;
}

async function fundThreeCard(connection, admin) {
  console.log(`\n=== Three Card Poker ===`);

  const [gameAddress] = findPDA([Buffer.from("threecard_game")], ORE_PROGRAM_ID);
  const [vaultAddress] = findPDA([Buffer.from("threecard_vault")], ORE_PROGRAM_ID);

  console.log(`Game PDA: ${gameAddress.toBase58()}`);
  console.log(`Vault PDA: ${vaultAddress.toBase58()}`);

  const signerAta = await getAssociatedTokenAddress(TCP_MINT, admin.publicKey);
  const vaultAta = await getAssociatedTokenAddress(TCP_MINT, vaultAddress, true);

  console.log(`Signer ATA: ${signerAta.toBase58()}`);
  console.log(`Vault ATA: ${vaultAta.toBase58()}`);

  // Check balances
  try {
    const balance = await connection.getTokenAccountBalance(signerAta);
    console.log(`Signer balance: ${balance.value.uiAmount}`);
  } catch (e) {
    console.log("No token balance found for signer");
    return false;
  }

  // Three Card Poker has a simpler account structure (5 accounts)
  // But the game account must already exist
  const gameAccount = await connection.getAccountInfo(gameAddress);
  if (!gameAccount) {
    console.log("Three Card game account doesn't exist - cannot fund");
    console.log("Need to initialize Three Card game first");
    return false;
  }

  // Build fund instruction
  const amount = BigInt(1_000) * BigInt(1_000_000_000); // 1k tokens
  const data = Buffer.alloc(9);
  data[0] = 63; // FundThreeCardHouse discriminator
  data.writeBigUInt64LE(amount, 1);

  // Account layout per program/src/threecard/fund_house.rs:
  // 0: signer (admin)
  // 1: threecard_game
  // 2: signer_tcp_ata
  // 3: vault_tcp_ata
  // 4: token_program
  const instruction = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: signerAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(instruction);
  tx.feePayer = admin.publicKey;

  console.log("Simulating transaction...");
  const simulation = await connection.simulateTransaction(tx, [admin]);

  if (simulation.value.err) {
    console.log("Simulation failed:", JSON.stringify(simulation.value.err));
    simulation.value.logs?.forEach(log => console.log("  ", log));
    return false;
  }

  console.log("Simulation passed! Sending...");
  const sig = await sendAndConfirmTransaction(connection, tx, [admin], {
    skipPreflight: false,
    commitment: "confirmed"
  });
  console.log(`SUCCESS! Signature: ${sig}`);
  return true;
}

async function main() {
  const connection = new Connection(DEVNET_RPC, "confirmed");

  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const admin = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log("Admin:", admin.publicKey.toBase58());

  const results = [];

  // Fund Video Poker (creates game if needed)
  try {
    const success = await fundVideoPoker(connection, admin);
    results.push({ name: "Video Poker", success });
  } catch (e) {
    console.log(`Error funding Video Poker:`, e.message);
    results.push({ name: "Video Poker", success: false, error: e.message });
  }

  // Fund Three Card Poker (requires game to exist)
  try {
    const success = await fundThreeCard(connection, admin);
    results.push({ name: "Three Card Poker", success });
  } catch (e) {
    console.log(`Error funding Three Card Poker:`, e.message);
    results.push({ name: "Three Card Poker", success: false, error: e.message });
  }

  console.log("\n=== SUMMARY ===");
  results.forEach(r => {
    console.log(`${r.name}: ${r.success ? "FUNDED" : "FAILED"}`);
  });
}

main().catch(console.error);
