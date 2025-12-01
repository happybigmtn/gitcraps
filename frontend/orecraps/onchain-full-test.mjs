#!/usr/bin/env node
/**
 * COMPREHENSIVE ON-CHAIN INTEGRATION TEST
 *
 * Tests that ALL transactions are executed on-chain and verifiable:
 * 1. FundCrapsHouse - Initialize and fund the craps game
 * 2. PlaceCrapsBet - Multiple bet types (PassLine, Field, AnySeven, etc.)
 * 3. Verify ALL transaction signatures on-chain
 *
 * NO SIMULATION - All transactions are real on-chain transactions
 */

import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  address,
  getProgramDerivedAddress,
  getAddressEncoder,
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
  lamports,
} from "@solana/kit";
import fs from "fs";

const SYSTEM_PROGRAM_ADDRESS = address("11111111111111111111111111111111");

const LOCALNET_RPC = "http://127.0.0.1:8899";
const LOCALNET_RPC_WS = "ws://127.0.0.1:8900";
const ORE_PROGRAM_ID = address("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const LAMPORTS_PER_SOL = 1_000_000_000n;

// CrapsBetType enum
const CrapsBetType = {
  PassLine: 0,
  DontPass: 1,
  Field: 10,
  AnySeven: 11,
  AnyCraps: 12,
  YoEleven: 13,
  Aces: 14,
  Twelve: 15,
};

// PDAs
async function crapsGamePDA() {
  return getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode("craps_game")],
  });
}

async function crapsPositionPDA(authority) {
  const addressEncoder = getAddressEncoder();
  return getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode("craps_position"), addressEncoder.encode(authority)],
  });
}

function toLeBytes(n, len) {
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = Number((n >> BigInt(8 * i)) & 0xffn);
  }
  return arr;
}

// FundCrapsHouse instruction (discriminator 26)
function createFundHouseInstruction(signer, crapsGame, amount) {
  const data = new Uint8Array(9);
  data[0] = 26;
  data.set(toLeBytes(BigInt(amount), 8), 1);
  return {
    programAddress: ORE_PROGRAM_ID,
    accounts: [
      { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
      { address: crapsGame, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  };
}

// PlaceCrapsBet instruction (discriminator 23)
function createPlaceBetInstruction(signer, crapsGame, crapsPosition, betType, point, amount) {
  const data = new Uint8Array(17);
  data[0] = 23;
  data[1] = betType;
  data[2] = point;
  data.set(toLeBytes(BigInt(amount), 8), 9);
  return {
    programAddress: ORE_PROGRAM_ID,
    accounts: [
      { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
      { address: crapsGame, role: AccountRole.WRITABLE },
      { address: crapsPosition, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  };
}

// Results tracking
const results = {
  totalTransactions: 0,
  confirmedOnChain: 0,
  failedTransactions: 0,
  signatures: [],
  errors: [],
};

async function sendAndConfirm(rpc, sendAndConfirmTransaction, signer, instruction, description) {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const tx = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstruction(instruction, m),
  );

  results.totalTransactions++;

  try {
    const signedTx = await signTransactionMessageWithSigners(tx);
    const sig = getSignatureFromTransaction(signedTx);
    await sendAndConfirmTransaction(signedTx, { commitment: "confirmed" });
    results.confirmedOnChain++;
    results.signatures.push({ sig, description });
    console.log(`  ✓ ${description}: ${sig.slice(0, 30)}...`);
    return { success: true, signature: sig };
  } catch (e) {
    results.failedTransactions++;
    results.errors.push({ description, error: e.message?.slice(0, 100) });
    console.log(`  ✗ ${description}: ${e.message?.slice(0, 80)}`);
    return { success: false, error: e.message };
  }
}

async function verifySignaturesOnChain(rpc) {
  console.log("\n========================================");
  console.log("VERIFYING SIGNATURES ON-CHAIN");
  console.log("========================================\n");

  let verified = 0;
  let failed = 0;

  for (const { sig, description } of results.signatures) {
    try {
      const { value: statuses } = await rpc.getSignatureStatuses([sig], { searchTransactionHistory: true }).send();
      const status = statuses?.[0];
      const confStatus = status?.confirmationStatus;

      if (confStatus === "confirmed" || confStatus === "finalized") {
        console.log(`  ✓ [${confStatus.toUpperCase()}] ${description}`);
        console.log(`    ${sig}`);
        verified++;
      } else {
        console.log(`  ? [${confStatus || "unknown"}] ${description}`);
        failed++;
      }
    } catch (e) {
      console.log(`  ✗ [ERROR] ${description}: ${e.message}`);
      failed++;
    }
  }

  return { verified, failed };
}

async function main() {
  console.log("========================================");
  console.log("ON-CHAIN INTEGRATION TEST");
  console.log("========================================");
  console.log("All transactions are REAL on-chain transactions\n");

  const rpc = createSolanaRpc(LOCALNET_RPC);
  const rpcSubscriptions = createSolanaRpcSubscriptions(LOCALNET_RPC_WS);
  const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

  // Verify connection
  const { value: version } = await rpc.getVersion().send();
  console.log(`Connected to localnet: Solana ${version["solana-core"]}`);

  // Load keypair
  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const signer = await createKeyPairSignerFromBytes(Uint8Array.from(keypairData));

  const [crapsGameAddress] = await crapsGamePDA();
  const [crapsPositionAddress] = await crapsPositionPDA(signer.address);

  console.log("\nAccounts:");
  console.log(`  Signer: ${signer.address}`);
  console.log(`  CrapsGame: ${crapsGameAddress}`);
  console.log(`  CrapsPosition: ${crapsPositionAddress}`);

  // Check if craps game exists, fund if needed
  const { value: crapsGameInfo } = await rpc.getAccountInfo(crapsGameAddress, { encoding: "base64" }).send();
  if (!crapsGameInfo) {
    console.log("\n--- FUNDING CRAPS HOUSE (First Time) ---");
    const fundAmount = 100n * LAMPORTS_PER_SOL;
    const fundIx = createFundHouseInstruction(signer, crapsGameAddress, fundAmount);
    await sendAndConfirm(rpc, sendAndConfirmTransaction, signer, fundIx, "FundCrapsHouse (100 SOL)");
  } else {
    console.log(`\nCrapsGame already exists with ${Number(crapsGameInfo.lamports) / Number(LAMPORTS_PER_SOL)} SOL`);
  }

  // Place multiple bets
  console.log("\n--- PLACING CRAPS BETS ---");

  const bets = [
    { type: CrapsBetType.PassLine, point: 0, amount: 0.01, name: "PassLine" },
    { type: CrapsBetType.DontPass, point: 0, amount: 0.01, name: "DontPass" },
    { type: CrapsBetType.Field, point: 0, amount: 0.02, name: "Field" },
    { type: CrapsBetType.AnySeven, point: 0, amount: 0.01, name: "AnySeven" },
    { type: CrapsBetType.AnyCraps, point: 0, amount: 0.01, name: "AnyCraps" },
    { type: CrapsBetType.YoEleven, point: 0, amount: 0.01, name: "YoEleven" },
    { type: CrapsBetType.Aces, point: 0, amount: 0.01, name: "Aces" },
    { type: CrapsBetType.Twelve, point: 0, amount: 0.01, name: "Twelve" },
  ];

  for (const bet of bets) {
    const betAmount = BigInt(Math.round(bet.amount * Number(LAMPORTS_PER_SOL)));
    const betIx = createPlaceBetInstruction(
      signer, crapsGameAddress, crapsPositionAddress,
      bet.type, bet.point, betAmount
    );
    await sendAndConfirm(rpc, sendAndConfirmTransaction, signer, betIx, `PlaceBet(${bet.name}, ${bet.amount} SOL)`);
    await new Promise(r => setTimeout(r, 200)); // Small delay
  }

  // Verify all signatures on-chain
  const { verified, failed } = await verifySignaturesOnChain(rpc);

  // Print final report
  console.log("\n========================================");
  console.log("FINAL REPORT");
  console.log("========================================");
  console.log(`\nTransaction Summary:`);
  console.log(`  Total Transactions:    ${results.totalTransactions}`);
  console.log(`  Confirmed On-Chain:    ${results.confirmedOnChain}`);
  console.log(`  Failed:                ${results.failedTransactions}`);
  console.log(`\nSignature Verification:`);
  console.log(`  Verified On-Chain:     ${verified}`);
  console.log(`  Not Verified:          ${failed}`);

  if (results.errors.length > 0) {
    console.log(`\nErrors:`);
    results.errors.forEach(e => console.log(`  - ${e.description}: ${e.error}`));
  }

  console.log("\n========================================");
  if (results.confirmedOnChain > 0 && results.failedTransactions === 0 && verified === results.signatures.length) {
    console.log("✓ ALL TRANSACTIONS VERIFIED ON-CHAIN");
    console.log("========================================\n");
    process.exit(0);
  } else {
    console.log("✗ SOME TRANSACTIONS FAILED OR NOT VERIFIED");
    console.log("========================================\n");
    process.exit(1);
  }
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
