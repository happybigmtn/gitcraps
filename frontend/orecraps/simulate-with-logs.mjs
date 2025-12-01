#!/usr/bin/env node
import { Connection, PublicKey, Keypair, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import fs from "fs";

const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");

function boardPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("board")], ORE_PROGRAM_ID);
}

function configPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], ORE_PROGRAM_ID);
}

function roundPDA(roundId) {
  const buffer = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    buffer[i] = Number((roundId >> BigInt(8 * i)) & 0xffn);
  }
  return PublicKey.findProgramAddressSync([Buffer.from("round"), buffer], ORE_PROGRAM_ID);
}

function toLEBytes(value, bytes) {
  const arr = new Uint8Array(bytes);
  let v = BigInt(value);
  for (let i = 0; i < bytes; i++) {
    arr[i] = Number(v & 0xffn);
    v = v >> 8n;
  }
  return arr;
}

async function main() {
  const connection = new Connection(DEVNET_RPC, "confirmed");
  
  // Load admin keypair
  const keypairData = JSON.parse(fs.readFileSync("/home/r/.config/solana/id.json", "utf-8"));
  const admin = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  console.log("Admin:", admin.publicKey.toBase58());
  
  const [boardAddress] = boardPDA();
  const [configAddress] = configPDA();
  const [roundAddress] = roundPDA(0n);
  
  console.log("Board:", boardAddress.toBase58());
  console.log("Config:", configAddress.toBase58());
  console.log("Round:", roundAddress.toBase58());
  
  // Create StartRound instruction
  // Discriminator 22, duration 3000 (8 bytes LE)
  const data = Buffer.alloc(9);
  data[0] = 22;
  data.set(toLEBytes(3000, 8), 1);
  
  const instruction = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: boardAddress, isSigner: false, isWritable: true },
      { pubkey: configAddress, isSigner: false, isWritable: false },
      { pubkey: roundAddress, isSigner: false, isWritable: true },
    ],
    data,
  });
  
  const transaction = new Transaction().add(instruction);
  
  try {
    // Simulate with full logs
    console.log("\nSimulating transaction...");
    const simResult = await connection.simulateTransaction(transaction, [admin], { commitment: "confirmed" });
    console.log("\nSimulation result:");
    console.log("  Error:", simResult.value.err);
    console.log("  Units consumed:", simResult.value.unitsConsumed);
    console.log("\n  Logs:");
    simResult.value.logs?.forEach((log, i) => console.log(`    ${i}: ${log}`));
  } catch (e) {
    console.error("Simulation error:", e.message);
    if (e.logs) {
      console.log("Logs:");
      e.logs.forEach(log => console.log("  ", log));
    }
  }
}

main().catch(console.error);
