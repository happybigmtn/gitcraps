#!/usr/bin/env node
/**
 * Start a new round on Devnet
 *
 * This script starts a new mining round by:
 * 1. Reading the current round ID from the Board account
 * 2. Sending a StartRound instruction to update the Board's start/end slots
 *
 * Only the admin (stored in Config account) can execute this.
 */
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  address,
  getProgramDerivedAddress,
  createKeyPairSignerFromBytes,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  signTransactionMessageWithSigners,
  getSignatureFromTransaction,
  sendAndConfirmTransactionFactory,
  AccountRole,
} from "@solana/kit";
import fs from "fs";

// Devnet configuration
const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const DEVNET_RPC_WS = "wss://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const ORE_PROGRAM_ID = address("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");

// PDA derivations
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

// Little-endian bytes helper
function toLeBytes(n, len) {
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = Number((BigInt(n) >> BigInt(8 * i)) & 0xffn);
  }
  return arr;
}

// Create StartRound instruction
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
  // Parse command line arguments
  const durationArg = process.argv[2];
  const duration = durationArg ? parseInt(durationArg, 10) : 3000; // Default: 3000 slots (~20 minutes)

  console.log("============================================================");
  console.log("STARTING NEW ROUND ON DEVNET");
  console.log("============================================================");
  console.log("RPC:", DEVNET_RPC.replace(/api-key=.*/, "api-key=***"));
  console.log("Duration:", duration, "slots");

  const rpc = createSolanaRpc(DEVNET_RPC);
  const rpcSubscriptions = createSolanaRpcSubscriptions(DEVNET_RPC_WS);
  const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

  // Load admin keypair
  const keypairPath = process.env.ADMIN_KEYPAIR_PATH || "/home/r/.config/solana/id.json";
  console.log("\nLoading keypair from:", keypairPath);
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const admin = await createKeyPairSignerFromBytes(Uint8Array.from(keypairData));
  console.log("Admin address:", admin.address);

  // Get PDAs
  const [boardAddress] = await getBoardPDA();
  const [configAddress] = await getConfigPDA();
  console.log("\nBoard PDA:", boardAddress);
  console.log("Config PDA:", configAddress);

  // Read current Board state to get round ID
  const boardAccount = await rpc.getAccountInfo(boardAddress, { encoding: "base64" }).send();
  if (!boardAccount.value) {
    console.error("\nERROR: Board account does not exist. Program may not be initialized.");
    process.exit(1);
  }

  const boardData = Buffer.from(boardAccount.value.data[0], "base64");
  // Board struct layout:
  // - discriminator: 8 bytes
  // - round_id: 8 bytes (u64)
  // - start_slot: 8 bytes (u64)
  // - end_slot: 8 bytes (u64)
  // - total_rng: 8 bytes (u64)
  // ...
  const roundId = boardData.readBigUInt64LE(8); // Skip 8-byte discriminator
  const currentStartSlot = boardData.readBigUInt64LE(16);
  const currentEndSlot = boardData.readBigUInt64LE(24);
  console.log("\nCurrent Board state:");
  console.log("  Round ID:", roundId.toString());
  console.log("  Start slot:", currentStartSlot.toString());
  console.log("  End slot:", currentEndSlot.toString());

  // Get current slot
  const slot = await rpc.getSlot().send();
  console.log("  Current slot:", slot);

  if (slot >= currentStartSlot && slot < currentEndSlot) {
    console.log("\nROUND IS ACTIVE - no need to start a new round.");
    console.log("Slots remaining:", (currentEndSlot - slot).toString());
    process.exit(0);
  }

  console.log("\nRound has expired or not started. Starting new round...");

  // Get round PDA for current round ID
  const [roundAddress] = await getRoundPDA(roundId);
  console.log("Round PDA:", roundAddress);

  // Check if Round account exists
  const roundAccount = await rpc.getAccountInfo(roundAddress, { encoding: "base64" }).send();
  if (!roundAccount.value) {
    console.error("\nERROR: Round account does not exist. Round may not have been created.");
    process.exit(1);
  }

  // Create and send StartRound transaction
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const startRoundIx = createStartRoundInstruction(
    admin,
    boardAddress,
    configAddress,
    roundAddress,
    duration
  );

  const tx = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(admin, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstruction(startRoundIx, m)
  );

  try {
    const signedTx = await signTransactionMessageWithSigners(tx);
    const sig = getSignatureFromTransaction(signedTx);
    console.log("\nSending transaction...");
    await sendAndConfirmTransaction(signedTx, { commitment: "confirmed" });
    console.log("SUCCESS! Transaction signature:", sig);

    // Verify the new state
    const boardAfter = await rpc.getAccountInfo(boardAddress, { encoding: "base64" }).send();
    const boardDataAfter = Buffer.from(boardAfter.value.data[0], "base64");
    const newStartSlot = boardDataAfter.readBigUInt64LE(16);
    const newEndSlot = boardDataAfter.readBigUInt64LE(24);

    console.log("\nNew Board state:");
    console.log("  Start slot:", newStartSlot.toString());
    console.log("  End slot:", newEndSlot.toString());
    console.log("  Duration:", (newEndSlot - newStartSlot).toString(), "slots");
    console.log("\nRound is now ACTIVE!");
    console.log("Slots remaining:", (newEndSlot - BigInt(slot)).toString());
  } catch (e) {
    console.error("\nERROR:", e.message?.slice(0, 300) || e.toString());
    if (e.logs) {
      console.log("\nProgram logs:");
      e.logs.forEach(log => console.log("  ", log));
    }
    process.exit(1);
  }

  console.log("\n============================================================");
  console.log("DONE");
  console.log("============================================================");
}

main().catch(console.error);
