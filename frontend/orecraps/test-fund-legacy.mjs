#!/usr/bin/env node
/**
 * Test FundRouletteHouse with legacy web3.js for better error handling
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
const ROUL_MINT = new PublicKey("34rCuo8DHHJaJTuEUF8NAXE7h8aBumqDpd48NfgXWVPi");

function findPDA(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

async function main() {
  const connection = new Connection(DEVNET_RPC, "confirmed");
  
  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const admin = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  
  console.log("Admin:", admin.publicKey.toBase58());
  
  // Get PDAs
  const [gameAddress] = findPDA([Buffer.from("roulette_game")], ORE_PROGRAM_ID);
  const [vaultAddress] = findPDA([Buffer.from("roulette_vault")], ORE_PROGRAM_ID);
  
  console.log("Game PDA:", gameAddress.toBase58());
  console.log("Vault PDA:", vaultAddress.toBase58());
  
  // Get ATAs
  const signerAta = await getAssociatedTokenAddress(ROUL_MINT, admin.publicKey);
  const vaultAta = await getAssociatedTokenAddress(ROUL_MINT, vaultAddress, true);
  
  console.log("Signer ATA:", signerAta.toBase58());
  console.log("Vault ATA:", vaultAta.toBase58());
  
  // Check signer balance
  try {
    const balance = await connection.getTokenAccountBalance(signerAta);
    console.log("Signer token balance:", balance.value.uiAmount);
  } catch (e) {
    console.log("No token balance found");
  }
  
  // Build instruction - smaller amount for testing
  const amount = BigInt(1_000) * BigInt(1_000_000_000); // 1k tokens
  const data = Buffer.alloc(9);
  data[0] = 47; // FundRouletteHouse discriminator
  data.writeBigUInt64LE(amount, 1);
  
  const instruction = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: false },
      { pubkey: signerAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: ROUL_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
  
  console.log("\nBuilding transaction...");
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
    
    if (simulation.value.err) {
      console.log("\nSimulation failed. Not sending.");
      return;
    }
  } catch (e) {
    console.log("Simulation error:", e.message);
    if (e.logs) {
      console.log("Logs:");
      e.logs.forEach(log => console.log("  ", log));
    }
    return;
  }
  
  // Send if simulation passed
  console.log("\nSending transaction...");
  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [admin], {
      skipPreflight: false,
      commitment: "confirmed"
    });
    console.log("SUCCESS! Signature:", sig);
  } catch (e) {
    console.log("Transaction error:", e.message);
    if (e.logs) {
      console.log("Logs:");
      e.logs.forEach(log => console.log("  ", log));
    }
  }
}

main().catch(console.error);
