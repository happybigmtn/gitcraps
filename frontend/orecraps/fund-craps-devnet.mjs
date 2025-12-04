#!/usr/bin/env node
/**
 * Fund Craps House on Devnet
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
const CRAP_MINT = new PublicKey("7frAenkamJSASBH9YukkzBsSMz9paQdYuSGw4SjWkXrf");

function findPDA(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

async function main() {
  const connection = new Connection(DEVNET_RPC, "confirmed");

  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const admin = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log("Admin:", admin.publicKey.toBase58());
  console.log("CRAP Mint:", CRAP_MINT.toBase58());

  // Get PDAs
  const [gameAddress] = findPDA([Buffer.from("craps_game")], ORE_PROGRAM_ID);
  const [vaultAddress] = findPDA([Buffer.from("craps_vault")], ORE_PROGRAM_ID);

  console.log("Craps Game PDA:", gameAddress.toBase58());
  console.log("Craps Vault PDA:", vaultAddress.toBase58());

  // Check game account
  const gameAccount = await connection.getAccountInfo(gameAddress);
  console.log("Craps game exists:", !!gameAccount, gameAccount?.data.length || 0, "bytes");

  if (gameAccount) {
    const data = gameAccount.data;
    const epochId = data.readBigUInt64LE(8);
    const point = data.readUInt8(16);
    const isComeOut = data.readUInt8(17);
    const houseBankroll = data.readBigUInt64LE(24);
    console.log(`Current state: epoch=${epochId}, point=${point}, isComeOut=${isComeOut}, bankroll=${houseBankroll}`);
  }

  // Get ATAs
  const signerAta = await getAssociatedTokenAddress(CRAP_MINT, admin.publicKey);
  const vaultAta = await getAssociatedTokenAddress(CRAP_MINT, vaultAddress, true);

  console.log("Signer CRAP ATA:", signerAta.toBase58());
  console.log("Vault CRAP ATA:", vaultAta.toBase58());

  // Check signer balance
  try {
    const balance = await connection.getTokenAccountBalance(signerAta);
    console.log("Signer CRAP balance:", balance.value.uiAmount);
  } catch (e) {
    console.log("No CRAP balance found");
  }

  // Build FundCrapsHouse instruction
  const amount = BigInt(100_000) * BigInt(1_000_000_000); // 100k tokens
  const data = Buffer.alloc(9);
  data[0] = 26; // FundCrapsHouse discriminator
  data.writeBigUInt64LE(amount, 1);

  // Account layout per program/src/craps/fund_house.rs:
  // 0: signer (admin)
  // 1: craps_game - game state PDA
  // 2: craps_vault - vault PDA
  // 3: signer_crap_ata - admin's CRAP token account
  // 4: vault_crap_ata - vault's CRAP token account
  // 5: crap_mint - CRAP token mint
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
      { pubkey: CRAP_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  console.log("\nBuilding FundCrapsHouse transaction...");
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

      // Check new game state
      const newGameAccount = await connection.getAccountInfo(gameAddress);
      if (newGameAccount) {
        const data = newGameAccount.data;
        const houseBankroll = data.readBigUInt64LE(24);
        console.log(`New bankroll: ${houseBankroll}`);
      }
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
