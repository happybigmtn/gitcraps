#!/usr/bin/env node
/**
 * Mint CRAP tokens to the test payer wallet for localnet testing
 */

import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  getAccount,
} from "@solana/spl-token";
import fs from "fs";

const LOCALNET_RPC = "http://127.0.0.1:8899";
const CRAP_MINT = new PublicKey("CRAPqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump");
const ONE_CRAP = 1_000_000_000n; // 10^9

// Load test keypair from env - must match .env.local TEST_KEYPAIR_SEED
const seedString = "XqqclpkdKvsk/ED+Ghq4OUfZ0Bzqm2PDJrQDuTg+N8g=";
const seed = Buffer.from(seedString, "base64");
const testPayer = Keypair.fromSeed(seed);

console.log("=== Mint CRAP to Test Payer ===");
console.log(`Test Payer: ${testPayer.publicKey.toBase58()}`);
console.log(`CRAP Mint: ${CRAP_MINT.toBase58()}`);

const connection = new Connection(LOCALNET_RPC, "confirmed");

async function main() {
  try {
    // Check payer SOL balance
    const balance = await connection.getBalance(testPayer.publicKey);
    console.log(`Payer SOL balance: ${balance / 1e9} SOL`);

    if (balance < 0.1e9) {
      console.log("Airdropping SOL to payer...");
      const sig = await connection.requestAirdrop(testPayer.publicKey, 5e9);
      await connection.confirmTransaction(sig, "confirmed");
      console.log("Airdrop confirmed");
    }

    // Get payer's CRAP ATA
    const payerAta = await getAssociatedTokenAddress(
      CRAP_MINT,
      testPayer.publicKey,
      false
    );
    console.log(`Payer ATA: ${payerAta.toBase58()}`);

    // Check if ATA exists
    let ataExists = false;
    try {
      const account = await getAccount(connection, payerAta);
      console.log(`ATA exists with ${Number(account.amount) / 1e9} CRAP`);
      ataExists = true;
    } catch (e) {
      console.log("ATA does not exist, will create");
    }

    // Load admin keypair (mint authority)
    let adminKeypair;
    const adminPath = process.env.HOME + "/.config/solana/id.json";
    if (fs.existsSync(adminPath)) {
      const adminSecret = JSON.parse(fs.readFileSync(adminPath));
      adminKeypair = Keypair.fromSecretKey(new Uint8Array(adminSecret));
      console.log(`Admin (mint authority): ${adminKeypair.publicKey.toBase58()}`);
    } else {
      throw new Error("No admin keypair found at " + adminPath);
    }

    // Airdrop to admin if needed
    const adminBalance = await connection.getBalance(adminKeypair.publicKey);
    if (adminBalance < 0.1e9) {
      console.log("Airdropping SOL to admin...");
      const sig = await connection.requestAirdrop(adminKeypair.publicKey, 5e9);
      await connection.confirmTransaction(sig, "confirmed");
    }

    const instructions = [];

    // Create ATA if needed
    if (!ataExists) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          adminKeypair.publicKey, // payer
          payerAta,
          testPayer.publicKey, // owner
          CRAP_MINT
        )
      );
    }

    // Mint 1000 CRAP to payer
    const amountToMint = 1000n * ONE_CRAP;
    console.log(`Minting ${Number(amountToMint) / 1e9} CRAP to payer...`);

    instructions.push(
      createMintToInstruction(
        CRAP_MINT,
        payerAta,
        adminKeypair.publicKey, // mint authority
        amountToMint
      )
    );

    // Build and send transaction
    const tx = new Transaction().add(...instructions);
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = adminKeypair.publicKey;
    tx.sign(adminKeypair);

    const sig = await connection.sendRawTransaction(tx.serialize());
    console.log(`Transaction sent: ${sig}`);

    await connection.confirmTransaction(sig, "confirmed");
    console.log("Transaction confirmed!");

    // Verify
    const finalAccount = await getAccount(connection, payerAta);
    console.log(`\nPayer CRAP balance: ${Number(finalAccount.amount) / 1e9} CRAP`);
    console.log("\nDone! Test payer is ready to place bets.");

  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
