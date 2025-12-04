#!/usr/bin/env node
/**
 * Debug War fund house instruction
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
const WAR_MINT = new PublicKey("HMhL9yb5zZ7v6WmQ79NzYj5ebbeX4TN2NUkcuFFFMusz");

function findPDA(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

async function main() {
  const connection = new Connection(DEVNET_RPC, "confirmed");

  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const admin = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log("Admin:", admin.publicKey.toBase58());
  console.log("WAR Mint:", WAR_MINT.toBase58());

  // Get PDAs - using the correct seeds from consts.rs
  const [gameAddress] = findPDA([Buffer.from("war_game")], ORE_PROGRAM_ID);
  const [vaultAddress] = findPDA([Buffer.from("war_vault")], ORE_PROGRAM_ID);

  console.log("War Game PDA:", gameAddress.toBase58());
  console.log("War Vault PDA:", vaultAddress.toBase58());

  // Check game account
  const gameAccount = await connection.getAccountInfo(gameAddress);
  console.log("War game exists:", !!gameAccount, gameAccount?.data.length || 0, "bytes");

  // Get ATAs
  const signerAta = await getAssociatedTokenAddress(WAR_MINT, admin.publicKey);
  const vaultAta = await getAssociatedTokenAddress(WAR_MINT, vaultAddress, true);

  console.log("Signer WAR ATA:", signerAta.toBase58());
  console.log("Vault WAR ATA:", vaultAta.toBase58());

  // Check signer balance
  try {
    const balance = await connection.getTokenAccountBalance(signerAta);
    console.log("Signer WAR balance:", balance.value.uiAmount);
  } catch (e) {
    console.log("No WAR balance found");
  }

  // Build FundWarHouse instruction
  const amount = BigInt(1_000) * BigInt(1_000_000_000); // 1k tokens
  const data = Buffer.alloc(9);
  data[0] = 53; // FundWarHouse discriminator
  data.writeBigUInt64LE(amount, 1);

  // Account layout per program/src/war/fund_house.rs:
  // 0: signer (admin)
  // 1: war_game - game state PDA
  // 2: war_vault - vault PDA
  // 3: signer_war_ata - admin's WAR token account
  // 4: vault_war_ata - vault's WAR token account
  // 5: system_program
  // 6: token_program
  // 7: associated_token_program
  const instruction = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: false },
      { pubkey: signerAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  console.log("\nBuilding FundWarHouse transaction...");
  const tx = new Transaction().add(instruction);
  tx.feePayer = admin.publicKey;

  // Simulate first
  console.log("\nSimulating transaction...");
  try {
    const simulation = await connection.simulateTransaction(tx, [admin]);
    console.log("\nSimulation result:");
    console.log("Err:", JSON.stringify(simulation.value.err));
    console.log("Logs:");
    simulation.value.logs?.forEach(log => console.log("  ", log));

    if (!simulation.value.err) {
      console.log("\nSimulation passed! Sending...");
      const sig = await sendAndConfirmTransaction(connection, tx, [admin], {
        skipPreflight: false,
        commitment: "confirmed"
      });
      console.log("SUCCESS! Signature:", sig);
    }
  } catch (e) {
    console.log("Error:", e.message);
    if (e.logs) {
      console.log("Logs:");
      e.logs.forEach(log => console.log("  ", log));
    }
  }
}

main().catch(console.error);
