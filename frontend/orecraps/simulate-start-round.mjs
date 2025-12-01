#!/usr/bin/env node
import {
  createSolanaRpc,
  address,
  getProgramDerivedAddress,
  createKeyPairSignerFromBytes,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  signTransactionMessageWithSigners,
  compileTransaction,
  AccountRole,
} from "@solana/kit";
import fs from "fs";

const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const ORE_PROGRAM_ID = address("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");

async function getBoardPDA() {
  return getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode("board")],
  });
}

async function getConfigPDA() {
  return getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode("config")],
  });
}

async function getRoundPDA(roundId) {
  const idBytes = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    idBytes[i] = Number((roundId >> BigInt(8 * i)) & 0xffn);
  }
  return getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode("round"), idBytes],
  });
}

function toLeBytes(n, len) {
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = Number((BigInt(n) >> BigInt(8 * i)) & 0xffn);
  }
  return arr;
}

function createStartRoundInstruction(signer, boardAddress, configAddress, roundAddress, duration) {
  const data = new Uint8Array(9);
  data[0] = 22; // StartRound discriminator
  data.set(toLeBytes(duration, 8), 1);
  return {
    programAddress: ORE_PROGRAM_ID,
    accounts: [
      { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
      { address: boardAddress, role: AccountRole.WRITABLE },
      { address: configAddress, role: AccountRole.READONLY },
      { address: roundAddress, role: AccountRole.WRITABLE },
    ],
    data,
  };
}

async function main() {
  const duration = 3000;
  console.log("Simulating StartRound on devnet...");
  
  const rpc = createSolanaRpc(DEVNET_RPC);
  
  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const admin = await createKeyPairSignerFromBytes(Uint8Array.from(keypairData));
  console.log("Admin:", admin.address);
  
  const [boardAddress] = await getBoardPDA();
  const [configAddress] = await getConfigPDA();
  const [roundAddress] = await getRoundPDA(0n);
  
  console.log("Board:", boardAddress);
  console.log("Config:", configAddress);
  console.log("Round:", roundAddress);
  
  // Get raw account data for debugging
  const boardAccount = await rpc.getAccountInfo(boardAddress, { encoding: "base64" }).send();
  const configAccount = await rpc.getAccountInfo(configAddress, { encoding: "base64" }).send();
  const roundAccount = await rpc.getAccountInfo(roundAddress, { encoding: "base64" }).send();
  
  console.log("\nBoard data (hex):");
  if (boardAccount.value) {
    const data = Buffer.from(boardAccount.value.data[0], "base64");
    console.log("  Length:", data.length);
    console.log("  First 40 bytes:", data.slice(0, 40).toString("hex"));
    console.log("  Discriminator byte 0:", data[0]);
  }
  
  console.log("\nConfig data (hex):");
  if (configAccount.value) {
    const data = Buffer.from(configAccount.value.data[0], "base64");
    console.log("  Length:", data.length);
    console.log("  First 48 bytes:", data.slice(0, 48).toString("hex"));
    console.log("  Discriminator byte 0:", data[0]);
    // Extract admin pubkey (bytes 8-40)
    const adminKey = data.slice(8, 40);
    console.log("  Admin pubkey (bytes 8-40):", adminKey.toString("hex"));
  }
  
  console.log("\nRound data (hex):");
  if (roundAccount.value) {
    const data = Buffer.from(roundAccount.value.data[0], "base64");
    console.log("  Length:", data.length);
    console.log("  First 40 bytes:", data.slice(0, 40).toString("hex"));
    console.log("  Discriminator byte 0:", data[0]);
  }
  
  // Build and simulate transaction
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const startRoundIx = createStartRoundInstruction(admin, boardAddress, configAddress, roundAddress, duration);
  
  const tx = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(admin, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstruction(startRoundIx, m),
  );
  
  const signedTx = await signTransactionMessageWithSigners(tx);
  const compiled = compileTransaction(signedTx);
  const serialized = Buffer.from(compiled.messageBytes).toString("base64");
  
  console.log("\nSimulating transaction...");
  try {
    const simResult = await rpc.simulateTransaction(serialized, { 
      encoding: "base64",
      commitment: "confirmed"
    }).send();
    console.log("Simulation result:", JSON.stringify(simResult, null, 2));
  } catch (e) {
    console.log("Simulation error:", e.message);
  }
}

main().catch(console.error);
