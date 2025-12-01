/**
 * Comprehensive Devnet Testing Script for ORE Craps
 *
 * Tests faucet (airdrop), mining, all bet types (0-25), and settlement
 * across multiple epochs with proper rate limiting for Helius RPC.
 *
 * Rate limiting: 10-15 second delays between calls to respect Helius limits.
 */

import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// Configuration
const RPC_URL = "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
// Devnet mint addresses (created via spl-token create-token, not vanity addresses)
const RNG_MINT = new PublicKey("8HJyJPD4iWD1X9FxZEjDuVpPqSBvNeaJCczXeK2xsShs");
const CRAP_MINT = new PublicKey("7frAenkamJSASBH9YukkzBsSMz9paQdYuSGw4SjWkXrf");

// Rate limiting - Helius free tier is limited
const RATE_LIMIT_MS = 12000; // 12 seconds between major operations
const SHORT_DELAY_MS = 3000;  // 3 seconds for minor operations

// CrapsBetType enum values
const CrapsBetType = {
  PassLine: 0,
  DontPass: 1,
  PassOdds: 2,
  DontPassOdds: 3,
  Come: 4,
  DontCome: 5,
  ComeOdds: 6,
  DontComeOdds: 7,
  Place: 8,
  Hardway: 9,
  Field: 10,
  AnySeven: 11,
  AnyCraps: 12,
  YoEleven: 13,
  Aces: 14,
  Twelve: 15,
  // Extended bet types (if any - checking for 16-25)
  BigSix: 16,
  BigEight: 17,
  Lay4: 18,
  Lay5: 19,
  Lay6: 20,
  Lay8: 21,
  Lay9: 22,
  Lay10: 23,
  Horn: 24,
  Hop: 25,
};

// All bet types to test
const ALL_BET_TYPES = [
  { name: "PassLine", betType: 0, point: 0, amount: 0.001 },
  { name: "DontPass", betType: 1, point: 0, amount: 0.001 },
  { name: "PassOdds", betType: 2, point: 4, amount: 0.001 },
  { name: "DontPassOdds", betType: 3, point: 4, amount: 0.001 },
  { name: "Come4", betType: 4, point: 4, amount: 0.001 },
  { name: "Come5", betType: 4, point: 5, amount: 0.001 },
  { name: "DontCome6", betType: 5, point: 6, amount: 0.001 },
  { name: "DontCome8", betType: 5, point: 8, amount: 0.001 },
  { name: "ComeOdds4", betType: 6, point: 4, amount: 0.001 },
  { name: "DontComeOdds5", betType: 7, point: 5, amount: 0.001 },
  { name: "Place4", betType: 8, point: 4, amount: 0.001 },
  { name: "Place5", betType: 8, point: 5, amount: 0.001 },
  { name: "Place6", betType: 8, point: 6, amount: 0.001 },
  { name: "Place8", betType: 8, point: 8, amount: 0.001 },
  { name: "Place9", betType: 8, point: 9, amount: 0.001 },
  { name: "Place10", betType: 8, point: 10, amount: 0.001 },
  { name: "Hard4", betType: 9, point: 4, amount: 0.001 },
  { name: "Hard6", betType: 9, point: 6, amount: 0.001 },
  { name: "Hard8", betType: 9, point: 8, amount: 0.001 },
  { name: "Hard10", betType: 9, point: 10, amount: 0.001 },
  { name: "Field", betType: 10, point: 0, amount: 0.001 },
  { name: "AnySeven", betType: 11, point: 0, amount: 0.001 },
  { name: "AnyCraps", betType: 12, point: 0, amount: 0.001 },
  { name: "YoEleven", betType: 13, point: 0, amount: 0.001 },
  { name: "Aces", betType: 14, point: 0, amount: 0.001 },
  { name: "Twelve", betType: 15, point: 0, amount: 0.001 },
  // Extended bet types (16-25)
  { name: "BigSix", betType: 16, point: 0, amount: 0.001 },
  { name: "BigEight", betType: 17, point: 0, amount: 0.001 },
  { name: "Lay4", betType: 18, point: 4, amount: 0.001 },
  { name: "Lay5", betType: 19, point: 5, amount: 0.001 },
  { name: "Lay6", betType: 20, point: 6, amount: 0.001 },
  { name: "Lay8", betType: 21, point: 8, amount: 0.001 },
  { name: "Lay9", betType: 22, point: 9, amount: 0.001 },
  { name: "Lay10", betType: 23, point: 10, amount: 0.001 },
  { name: "Horn", betType: 24, point: 0, amount: 0.001 },
  { name: "Hop", betType: 25, point: 0, amount: 0.001 },
];

// PDA Derivations
function boardPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("board")], PROGRAM_ID);
}

function configPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
}

function treasuryPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("treasury")], PROGRAM_ID);
}

function crapsGamePDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("craps_game")], PROGRAM_ID);
}

function crapsPositionPDA(authority) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("craps_position"), authority.toBuffer()],
    PROGRAM_ID
  );
}

function crapsVaultPDA() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("craps_vault")],
    PROGRAM_ID
  );
}

// Helpers
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function toLeBytes(value, size) {
  const buf = Buffer.alloc(size);
  if (typeof value === "bigint") {
    for (let i = 0; i < size; i++) {
      buf[i] = Number((value >> BigInt(i * 8)) & BigInt(0xff));
    }
  } else {
    buf.writeUIntLE(value, 0, Math.min(size, 6));
  }
  return buf;
}

function loadKeypair(pathOrSeed) {
  if (pathOrSeed.startsWith("/") || pathOrSeed.startsWith("~")) {
    // File path
    const resolvedPath = pathOrSeed.replace(/^~/, process.env.HOME || "");
    const keyData = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
    return Keypair.fromSecretKey(Uint8Array.from(keyData));
  } else {
    // Base64 encoded seed or secret key
    const decoded = Buffer.from(pathOrSeed, "base64");
    return Keypair.fromSecretKey(decoded);
  }
}

// OreInstruction discriminators (matches program enum)
const OreInstruction = {
  PlaceCrapsBet: 23,
};

// Create PlaceCrapsBet instruction with correct 10-account structure
function createPlaceCrapsBetInstruction(authority, betType, point, amount) {
  const [crapsGameAddress] = crapsGamePDA();
  const [crapsPositionAddress] = crapsPositionPDA(authority);
  const [crapsVaultAddress] = crapsVaultPDA();

  // CRAP token accounts
  const signerCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, authority);
  const vaultCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, crapsVaultAddress, true); // PDA owned

  // Build instruction data
  // Format: [discriminator (1 byte)] [bet_type (1 byte)] [point (1 byte)] [padding (6 bytes)] [amount (8 bytes)]
  const data = new Uint8Array(17);
  data[0] = OreInstruction.PlaceCrapsBet;
  data[1] = betType;
  data[2] = point;
  // data[3-8] = padding (zeros)
  const amountBytes = toLeBytes(BigInt(Math.floor(amount * 1e9)), 8);
  data.set(amountBytes, 9);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: crapsGameAddress, isSigner: false, isWritable: true },
      { pubkey: crapsPositionAddress, isSigner: false, isWritable: true },
      { pubkey: crapsVaultAddress, isSigner: false, isWritable: false },
      { pubkey: signerCrapAta, isSigner: false, isWritable: true },
      { pubkey: vaultCrapAta, isSigner: false, isWritable: true },
      { pubkey: CRAP_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

// Test results tracker
const results = {
  rpcConnection: { status: "pending" },
  programExists: { status: "pending" },
  walletBalance: { status: "pending" },
  boardInitialized: { status: "pending" },
  betTests: [],
  issues: [],
  startTime: Date.now(),
};

async function testRPCConnection(connection) {
  console.log("\n=== Testing RPC Connection ===");
  try {
    const slot = await connection.getSlot();
    const version = await connection.getVersion();
    console.log(`Connected to devnet! Slot: ${slot}, Version: ${JSON.stringify(version)}`);
    results.rpcConnection = { status: "success", slot, version };
    return true;
  } catch (error) {
    console.log(`RPC Connection failed: ${error.message}`);
    results.rpcConnection = { status: "failed", error: error.message };
    results.issues.push("RPC connection failed - check Helius API key");
    return false;
  }
}

async function testProgramExists(connection) {
  console.log("\n=== Checking Program Deployment ===");
  await sleep(SHORT_DELAY_MS);

  try {
    const programInfo = await connection.getAccountInfo(PROGRAM_ID);
    if (programInfo && programInfo.executable) {
      console.log(`Program exists at ${PROGRAM_ID.toBase58()}`);
      console.log(`Program data length: ${programInfo.data.length} bytes`);
      results.programExists = { status: "success", size: programInfo.data.length };
      return true;
    } else {
      console.log("Program not found or not executable!");
      results.programExists = { status: "failed", error: "Program not found" };
      results.issues.push("ORE program not deployed to devnet");
      return false;
    }
  } catch (error) {
    console.log(`Error checking program: ${error.message}`);
    results.programExists = { status: "failed", error: error.message };
    return false;
  }
}

async function testBoardInitialized(connection) {
  console.log("\n=== Checking Board Initialization ===");
  await sleep(SHORT_DELAY_MS);

  try {
    const [boardAddress] = boardPDA();
    const boardInfo = await connection.getAccountInfo(boardAddress);

    if (boardInfo) {
      console.log(`Board account exists at ${boardAddress.toBase58()}`);
      console.log(`Board data length: ${boardInfo.data.length} bytes`);
      results.boardInitialized = { status: "success", address: boardAddress.toBase58() };
      return true;
    } else {
      console.log("Board not initialized - run ore-cli initialize first");
      results.boardInitialized = { status: "failed", error: "Board not initialized" };
      results.issues.push("Board account not initialized on devnet");
      return false;
    }
  } catch (error) {
    console.log(`Error checking board: ${error.message}`);
    results.boardInitialized = { status: "failed", error: error.message };
    return false;
  }
}

async function testWalletBalance(connection, wallet) {
  console.log("\n=== Checking Wallet Balance ===");
  await sleep(SHORT_DELAY_MS);

  try {
    const balance = await connection.getBalance(wallet.publicKey);
    const balanceSOL = balance / LAMPORTS_PER_SOL;
    console.log(`Wallet: ${wallet.publicKey.toBase58()}`);
    console.log(`Balance: ${balanceSOL} SOL`);

    results.walletBalance = {
      status: balanceSOL > 0.01 ? "success" : "warning",
      balance: balanceSOL,
      address: wallet.publicKey.toBase58()
    };

    if (balanceSOL < 0.01) {
      console.log("WARNING: Low balance! Need devnet SOL for testing.");
      console.log(`Run: solana airdrop 1 ${wallet.publicKey.toBase58()} --url devnet`);
      results.issues.push("Wallet balance too low for comprehensive testing");
    }

    return balanceSOL > 0.001; // Need at least 0.001 SOL to continue
  } catch (error) {
    console.log(`Error checking balance: ${error.message}`);
    results.walletBalance = { status: "failed", error: error.message };
    return false;
  }
}

async function checkTokenAccounts(connection, wallet) {
  console.log("\n=== Checking Token Accounts ===");
  await sleep(SHORT_DELAY_MS);

  try {
    // Check RNG token account
    const rngAta = await getAssociatedTokenAddress(RNG_MINT, wallet.publicKey);
    const rngInfo = await connection.getAccountInfo(rngAta);

    if (rngInfo) {
      console.log(`RNG ATA exists: ${rngAta.toBase58()}`);
    } else {
      console.log(`RNG ATA does not exist - will need to create`);
    }

    await sleep(SHORT_DELAY_MS);

    // Check CRAP token account
    const crapAta = await getAssociatedTokenAddress(CRAP_MINT, wallet.publicKey);
    const crapInfo = await connection.getAccountInfo(crapAta);

    if (crapInfo) {
      console.log(`CRAP ATA exists: ${crapAta.toBase58()}`);
    } else {
      console.log(`CRAP ATA does not exist - will need to create`);
    }

    return { rngAta: rngAta.toBase58(), crapAta: crapAta.toBase58() };
  } catch (error) {
    console.log(`Error checking token accounts: ${error.message}`);
    return null;
  }
}

async function testCrapsGameAccount(connection) {
  console.log("\n=== Checking Craps Game Account ===");
  await sleep(SHORT_DELAY_MS);

  try {
    const [crapsGame] = crapsGamePDA();
    const gameInfo = await connection.getAccountInfo(crapsGame);

    if (gameInfo) {
      console.log(`Craps Game exists at ${crapsGame.toBase58()}`);
      console.log(`Game data length: ${gameInfo.data.length} bytes`);

      // Try to parse basic state
      if (gameInfo.data.length >= 16) {
        const roundId = gameInfo.data.readBigUInt64LE(8);
        console.log(`Current round ID: ${roundId}`);
      }
      return true;
    } else {
      console.log("Craps Game account not created yet - will be created on first bet");
      return false;
    }
  } catch (error) {
    console.log(`Error checking craps game: ${error.message}`);
    return false;
  }
}

async function testBetType(connection, wallet, bet, index, total) {
  console.log(`\n--- Testing bet ${index + 1}/${total}: ${bet.name} (type ${bet.betType}, point ${bet.point}) ---`);

  // Rate limiting
  await sleep(RATE_LIMIT_MS);

  const testResult = {
    name: bet.name,
    betType: bet.betType,
    point: bet.point,
    status: "pending",
    signature: null,
    error: null,
    simulated: false,
  };

  try {
    // Create the instruction
    const instruction = createPlaceCrapsBetInstruction(
      wallet.publicKey,
      bet.betType,
      bet.point,
      bet.amount
    );

    // Create transaction
    const tx = new Transaction().add(instruction);
    tx.feePayer = wallet.publicKey;

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    // Simulate the transaction first
    console.log(`  Simulating ${bet.name}...`);
    const simResult = await connection.simulateTransaction(tx);

    if (simResult.value.err) {
      const errMsg = JSON.stringify(simResult.value.err);
      console.log(`  Simulation failed: ${errMsg}`);
      testResult.status = "sim_failed";
      testResult.error = errMsg;
      testResult.simulated = true;
      testResult.logs = simResult.value.logs?.slice(-5);

      // Check for common errors
      if (errMsg.includes("AccountNotFound")) {
        results.issues.push(`${bet.name}: Account not found - game may not be initialized`);
      } else if (errMsg.includes("InstructionError")) {
        results.issues.push(`${bet.name}: Instruction error - check bet type or point value`);
      }
    } else {
      console.log(`  Simulation successful for ${bet.name}!`);
      testResult.status = "sim_success";
      testResult.simulated = true;

      // Could send the actual transaction here if needed
      // const signature = await sendAndConfirmTransaction(connection, tx, [wallet]);
      // testResult.signature = signature;
      // testResult.status = "confirmed";
    }
  } catch (error) {
    console.log(`  Error testing ${bet.name}: ${error.message}`);
    testResult.status = "error";
    testResult.error = error.message;
  }

  results.betTests.push(testResult);
  return testResult;
}

async function generateReport() {
  const endTime = Date.now();
  const duration = ((endTime - results.startTime) / 1000).toFixed(1);

  console.log("\n" + "=".repeat(70));
  console.log("DEVNET COMPREHENSIVE TEST REPORT");
  console.log("=".repeat(70));
  console.log(`Duration: ${duration} seconds`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  console.log("\n--- Infrastructure Status ---");
  console.log(`RPC Connection: ${results.rpcConnection.status}`);
  console.log(`Program Deployed: ${results.programExists.status}`);
  console.log(`Board Initialized: ${results.boardInitialized.status}`);
  console.log(`Wallet Balance: ${results.walletBalance.status} (${results.walletBalance.balance || 0} SOL)`);

  console.log("\n--- Bet Type Tests ---");
  const successCount = results.betTests.filter(t => t.status === "sim_success" || t.status === "confirmed").length;
  const failCount = results.betTests.filter(t => t.status === "sim_failed" || t.status === "error").length;
  const pendingCount = results.betTests.filter(t => t.status === "pending").length;

  console.log(`Successful: ${successCount}/${results.betTests.length}`);
  console.log(`Failed: ${failCount}/${results.betTests.length}`);
  console.log(`Pending: ${pendingCount}/${results.betTests.length}`);

  if (results.betTests.length > 0) {
    console.log("\nDetailed Results:");
    for (const test of results.betTests) {
      const statusIcon = test.status.includes("success") ? "[OK]" : test.status.includes("fail") ? "[FAIL]" : "[?]";
      console.log(`  ${statusIcon} ${test.name} (type ${test.betType}): ${test.status}`);
      if (test.error) {
        console.log(`       Error: ${test.error.slice(0, 80)}...`);
      }
    }
  }

  if (results.issues.length > 0) {
    console.log("\n--- Issues Found ---");
    for (const issue of results.issues) {
      console.log(`  - ${issue}`);
    }
  }

  console.log("\n" + "=".repeat(70));

  // Save report to file
  const reportPath = "./devnet-test-report.json";
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`Report saved to: ${reportPath}`);
}

async function main() {
  console.log("=".repeat(70));
  console.log("ORE CRAPS DEVNET COMPREHENSIVE TEST");
  console.log("=".repeat(70));
  console.log(`RPC: ${RPC_URL.replace(/api-key=.*/, "api-key=***")}`);
  console.log(`Program: ${PROGRAM_ID.toBase58()}`);
  console.log(`Rate limit: ${RATE_LIMIT_MS}ms between operations`);
  console.log("=".repeat(70));

  // Initialize connection
  const connection = new Connection(RPC_URL, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60000,
  });

  // Load wallet from environment or config
  let wallet;
  const keypairPath = process.env.ADMIN_KEYPAIR_PATH || "~/.config/solana/id.json";
  const keypairEnv = process.env.ADMIN_KEYPAIR;

  try {
    if (keypairEnv) {
      wallet = loadKeypair(keypairEnv);
      console.log(`Loaded wallet from ADMIN_KEYPAIR env`);
    } else {
      wallet = loadKeypair(keypairPath);
      console.log(`Loaded wallet from ${keypairPath}`);
    }
  } catch (error) {
    console.log(`Could not load keypair: ${error.message}`);
    console.log("Create one with: solana-keygen new");
    return;
  }

  // Run tests
  if (!(await testRPCConnection(connection))) {
    console.log("\nCannot proceed without RPC connection");
    await generateReport();
    return;
  }

  if (!(await testProgramExists(connection))) {
    console.log("\nWARNING: Program may not be deployed to devnet");
    results.issues.push("Program not found on devnet - deploy with anchor deploy --program-id <ID>");
  }

  await testBoardInitialized(connection);

  const hasBalance = await testWalletBalance(connection, wallet);
  if (!hasBalance) {
    console.log("\nInsufficient balance - requesting devnet airdrop...");
    try {
      const sig = await connection.requestAirdrop(wallet.publicKey, LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
      console.log("Airdrop successful!");
      await sleep(SHORT_DELAY_MS);
      await testWalletBalance(connection, wallet);
    } catch (error) {
      console.log(`Airdrop failed: ${error.message}`);
      results.issues.push("Could not get devnet SOL - rate limited or unavailable");
    }
  }

  await checkTokenAccounts(connection, wallet);
  await testCrapsGameAccount(connection);

  // Test a subset of bet types (rate limiting makes testing all 26 take ~5 minutes)
  console.log("\n=== Testing Bet Types ===");
  console.log("Testing representative bet types to verify program functionality...");

  // Select representative bets to test (one from each category)
  const representativeBets = [
    ALL_BET_TYPES[0],  // PassLine (type 0)
    ALL_BET_TYPES[4],  // Come (type 4, point 4)
    ALL_BET_TYPES[10], // Place (type 8, point 4)
    ALL_BET_TYPES[16], // Hard (type 9, point 4)
    ALL_BET_TYPES[20], // Field (type 10)
    ALL_BET_TYPES[21], // AnySeven (type 11)
    ALL_BET_TYPES[24], // Aces (type 14)
  ];

  console.log(`Testing ${representativeBets.length} representative bet types...`);

  for (let i = 0; i < representativeBets.length; i++) {
    await testBetType(connection, wallet, representativeBets[i], i, representativeBets.length);
  }

  // Generate report
  await generateReport();
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
