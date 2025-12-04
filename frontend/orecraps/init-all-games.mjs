#!/usr/bin/env node
/**
 * Initialize ALL casino games on Devnet
 * - War, Sic Bo, Three Card Poker, Video Poker, UTH
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
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction
} from "@solana/spl-token";
import fs from "fs";

const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");

// Devnet mint addresses
const MINTS = {
  WAR: new PublicKey("HMhL9yb5zZ7v6WmQ79NzYj5ebbeX4TN2NUkcuFFFMusz"),
  SICO: new PublicKey("5UkoVvbA7xNy9ysGVvw2hDpos6mMXJ7xRDKusV6QDEVr"),
  TCP: new PublicKey("3UTs2U6ps5z1asibwgtCZAtbatuKGcqX85QJ7zZBvvth"),
  VPK: new PublicKey("GNPiaDCr18GZ4PKcHDEFuAXkisBpN2aosBruqNAdXT2W"),
  UTH: new PublicKey("2yEhxizZGU27xB3HdjMKEVtJN5C6WrG241Lu3QcYbt5u"),
};

// Game configurations - [gameSeed, vaultSeed, discriminator, needsMint]
// needsMint: true = 9 accounts (with mint at position 5), false = 8 accounts
const GAMES = {
  WAR: ["war_game", "war_vault", 53, false],      // FundWarHouse = 53 (8 accounts)
  SICO: ["sicbo_game", "sicbo_vault", 57, true],  // FundSicBoHouse = 57 (9 accounts)
  TCP: ["threecard_game", "threecard_vault", 63, false], // FundThreeCardHouse = 63 (8 accounts)
  VPK: ["video_poker_game", "video_poker_vault", 68, true], // FundVideoPokerHouse = 68 (9 accounts)
  UTH: ["uth_game", "uth_vault", 75, true], // FundUTHHouse = 75 (9 accounts)
};

function findPDA(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

async function ensureATA(connection, payer, mint, owner, allowOwnerOffCurve = false) {
  const ata = await getAssociatedTokenAddress(mint, owner, allowOwnerOffCurve);
  const info = await connection.getAccountInfo(ata);
  if (!info) {
    console.log(`  Creating ATA for ${owner.toBase58().slice(0, 8)}...`);
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(payer.publicKey, ata, owner, mint)
    );
    await sendAndConfirmTransaction(connection, tx, [payer]);
  }
  return ata;
}

async function fundGameHouse(connection, admin, gameName, mint, gameSeeds, discriminator, needsMint, amount) {
  console.log(`\n--- Funding ${gameName} House ---`);

  const [gameAddress] = findPDA([Buffer.from(gameSeeds[0])], ORE_PROGRAM_ID);
  const [vaultAddress] = findPDA([Buffer.from(gameSeeds[1])], ORE_PROGRAM_ID);

  console.log(`  Game PDA: ${gameAddress.toBase58()}`);
  console.log(`  Vault PDA: ${vaultAddress.toBase58()}`);
  console.log(`  Mint: ${mint.toBase58()}`);
  console.log(`  Account layout: ${needsMint ? "9 accounts (with mint)" : "8 accounts (no mint)"}`);

  // Check if game already initialized
  const gameAccount = await connection.getAccountInfo(gameAddress);
  if (gameAccount) {
    const bankroll = gameAccount.data.readBigUInt64LE(16);
    console.log(`  Already initialized! Bankroll: ${bankroll}`);
    if (bankroll > 0) {
      console.log(`  Skipping (already funded)`);
      return true;
    }
  }

  // Get/create ATAs
  const signerAta = await ensureATA(connection, admin, mint, admin.publicKey);
  const vaultAta = await ensureATA(connection, admin, mint, vaultAddress, true);

  // Check admin balance
  try {
    const balance = await connection.getTokenAccountBalance(signerAta);
    console.log(`  Admin balance: ${balance.value.uiAmount}`);
    if (BigInt(balance.value.amount) < amount) {
      console.log(`  ERROR: Insufficient balance for funding`);
      return false;
    }
  } catch (e) {
    console.log(`  ERROR: No token balance: ${e.message}`);
    return false;
  }

  // Build FundHouse instruction
  const data = Buffer.alloc(9);
  data[0] = discriminator;
  data.writeBigUInt64LE(amount, 1);

  // Build account list based on needsMint
  const keys = [
    { pubkey: admin.publicKey, isSigner: true, isWritable: true },
    { pubkey: gameAddress, isSigner: false, isWritable: true },
    { pubkey: vaultAddress, isSigner: false, isWritable: false },
    { pubkey: signerAta, isSigner: false, isWritable: true },
    { pubkey: vaultAta, isSigner: false, isWritable: true },
  ];

  if (needsMint) {
    // 9 accounts: add mint at position 5
    keys.push({ pubkey: mint, isSigner: false, isWritable: false });
  }

  keys.push(
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  );

  const instruction = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys,
    data,
  });

  const tx = new Transaction().add(instruction);
  tx.feePayer = admin.publicKey;

  try {
    console.log(`  Simulating...`);
    const simulation = await connection.simulateTransaction(tx, [admin]);
    if (simulation.value.err) {
      console.log(`  Simulation failed:`, JSON.stringify(simulation.value.err));
      simulation.value.logs?.forEach(log => console.log(`    ${log}`));
      return false;
    }

    console.log(`  Sending transaction...`);
    const sig = await sendAndConfirmTransaction(connection, tx, [admin], {
      skipPreflight: false,
      commitment: "confirmed"
    });
    console.log(`  SUCCESS! Sig: ${sig}`);
    return true;
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
    if (e.logs) e.logs.forEach(log => console.log(`    ${log}`));
    return false;
  }
}

async function main() {
  const connection = new Connection(DEVNET_RPC, "confirmed");

  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const admin = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log("=".repeat(60));
  console.log("INITIALIZE ALL CASINO GAMES ON DEVNET");
  console.log("=".repeat(60));
  console.log("Admin:", admin.publicKey.toBase58());

  const amount = BigInt(100_000) * BigInt(1_000_000_000); // 100k tokens
  const results = {};

  for (const [gameName, config] of Object.entries(GAMES)) {
    const mint = MINTS[gameName];
    const gameSeeds = [config[0], config[1]];
    const discriminator = config[2];
    const needsMint = config[3];

    results[gameName] = await fundGameHouse(
      connection, admin, gameName, mint, gameSeeds, discriminator, needsMint, amount
    );
  }

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  for (const [game, success] of Object.entries(results)) {
    console.log(`  ${game}: ${success ? "SUCCESS" : "FAILED"}`);
  }
}

main().catch(console.error);
