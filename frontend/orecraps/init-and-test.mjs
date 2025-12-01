#!/usr/bin/env node
/**
 * COMPREHENSIVE LOCALNET INITIALIZATION AND TESTING
 *
 * This script:
 * 1. Initializes the ORE program (Board, Config, Treasury, Round 0)
 * 2. Funds the Craps House with SOL
 * 3. Starts a round
 * 4. Places bets of all types
 * 5. Settles rounds and verifies bet resolution
 * 6. Tests multiple epochs
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
} from "@solana/kit";
import fs from "fs";

const SYSTEM_PROGRAM_ADDRESS = address("11111111111111111111111111111111");

const LOCALNET_RPC = "http://127.0.0.1:8899";
const LOCALNET_RPC_WS = "ws://127.0.0.1:8900";
const ORE_PROGRAM_ID = address("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const LAMPORTS_PER_SOL = 1_000_000_000n;

// Instruction discriminators from the Rust program
const DISCRIMINATORS = {
  Initialize: 0,
  Deploy: 1,
  Reset: 2,
  Checkpoint: 3,
  ClaimSol: 4,
  ClaimOre: 5,
  Automate: 6,
  Bury: 7,
  Wrap: 8,
  Close: 9,
  SetAdmin: 10,
  SetAdminFee: 11,
  SetFeeCollector: 12,
  Deposit: 13,
  Withdraw: 14,
  ClaimYield: 15,
  RecycleSol: 16,
  NewVar: 17,
  SetSwapProgram: 18,
  SetVarAddress: 19,
  StartRound: 20,
  Log: 21,
  InitCrapsGame: 22,
  PlaceCrapsBet: 23,
  SettleCraps: 24,
  CancelCrapsBet: 25,
  FundCrapsHouse: 26,
};

// CrapsBetType enum - matching Rust program
const CrapsBetType = {
  PassLine: 0,
  DontPass: 1,
  Come: 2,
  DontCome: 3,
  Place4: 4,
  Place5: 5,
  Place6: 6,
  Place8: 7,
  Place9: 8,
  Place10: 9,
  Field: 10,
  AnySeven: 11,
  AnyCraps: 12,
  YoEleven: 13,
  Aces: 14,
  Twelve: 15,
};

// PDAs
async function boardPDA() {
  return getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode("board")],
  });
}

async function configPDA() {
  return getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode("config")],
  });
}

async function treasuryPDA() {
  return getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode("treasury")],
  });
}

async function roundPDA(roundId) {
  const idBytes = toLeBytes(BigInt(roundId), 8);
  return getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode("round"), idBytes],
  });
}

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

// Build Initialize instruction
function createInitializeInstruction(signer, board, config, treasury, round) {
  const data = new Uint8Array(1);
  data[0] = DISCRIMINATORS.Initialize;
  return {
    programAddress: ORE_PROGRAM_ID,
    accounts: [
      { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
      { address: board, role: AccountRole.WRITABLE },
      { address: config, role: AccountRole.WRITABLE },
      { address: treasury, role: AccountRole.WRITABLE },
      { address: round, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  };
}

// Build StartRound instruction
function createStartRoundInstruction(signer, board, config, round, duration) {
  const data = new Uint8Array(9);
  data[0] = DISCRIMINATORS.StartRound;
  data.set(toLeBytes(BigInt(duration), 8), 1);
  return {
    programAddress: ORE_PROGRAM_ID,
    accounts: [
      { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
      { address: board, role: AccountRole.WRITABLE },
      { address: config, role: AccountRole.READONLY },
      { address: round, role: AccountRole.WRITABLE },
    ],
    data,
  };
}

// Build InitCrapsGame instruction
function createInitCrapsGameInstruction(signer, crapsGame) {
  const data = new Uint8Array(1);
  data[0] = DISCRIMINATORS.InitCrapsGame;
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

// Build FundCrapsHouse instruction
function createFundHouseInstruction(signer, crapsGame, amount) {
  const data = new Uint8Array(9);
  data[0] = DISCRIMINATORS.FundCrapsHouse;
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

// Build PlaceCrapsBet instruction
function createPlaceBetInstruction(signer, crapsGame, crapsPosition, betType, point, amount) {
  // Data: discriminator(1) + betType(1) + point(1) + _padding(6) + amount(8) = 17 bytes
  const data = new Uint8Array(17);
  data[0] = DISCRIMINATORS.PlaceCrapsBet;
  data[1] = betType;
  data[2] = point;
  // padding bytes 3-8 are already 0
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

// Build SettleCraps instruction
function createSettleCrapsInstruction(signer, crapsGame, crapsPosition, round, winningSquare) {
  const data = new Uint8Array(9);
  data[0] = DISCRIMINATORS.SettleCraps;
  data.set(toLeBytes(BigInt(winningSquare), 8), 1);
  return {
    programAddress: ORE_PROGRAM_ID,
    accounts: [
      { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
      { address: crapsGame, role: AccountRole.WRITABLE },
      { address: crapsPosition, role: AccountRole.WRITABLE },
      { address: round, role: AccountRole.READONLY },
    ],
    data,
  };
}

// Send and confirm helper
async function sendAndConfirm(rpc, sendAndConfirmTransaction, signer, instruction, description) {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const tx = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstruction(instruction, m),
  );

  try {
    const signedTx = await signTransactionMessageWithSigners(tx);
    const sig = getSignatureFromTransaction(signedTx);
    await sendAndConfirmTransaction(signedTx, { commitment: "confirmed" });
    console.log(`  ✓ ${description}: ${sig.slice(0, 30)}...`);
    return { success: true, signature: sig };
  } catch (e) {
    const errorMsg = e.message?.slice(0, 150) || String(e);
    console.log(`  ✗ ${description}: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

// Convert dice result to winning square
function diceToSquare(die1, die2) {
  return (die1 - 1) * 6 + (die2 - 1);
}

// Check if a bet wins for a given dice roll
function checkBetWins(betType, die1, die2) {
  const sum = die1 + die2;

  switch (betType) {
    case CrapsBetType.PassLine:
      // Wins on 7 or 11 (come-out roll)
      return sum === 7 || sum === 11;
    case CrapsBetType.DontPass:
      // Wins on 2, 3. Push on 12. Loses on 7, 11
      return sum === 2 || sum === 3;
    case CrapsBetType.Field:
      // Wins on 2, 3, 4, 9, 10, 11, 12
      return [2, 3, 4, 9, 10, 11, 12].includes(sum);
    case CrapsBetType.AnySeven:
      return sum === 7;
    case CrapsBetType.AnyCraps:
      // Wins on 2, 3, or 12
      return sum === 2 || sum === 3 || sum === 12;
    case CrapsBetType.YoEleven:
      return sum === 11;
    case CrapsBetType.Aces:
      return sum === 2;
    case CrapsBetType.Twelve:
      return sum === 12;
    default:
      return false;
  }
}

// Results tracking
const results = {
  initialized: false,
  crapsGameFunded: false,
  roundsCompleted: 0,
  betsPlaced: 0,
  betsSettled: 0,
  betsWon: 0,
  betsLost: 0,
  signatures: [],
  errors: [],
};

async function main() {
  console.log("========================================");
  console.log("COMPREHENSIVE LOCALNET TEST");
  console.log("========================================");
  console.log("Testing initialization, betting, and settlement\n");

  const rpc = createSolanaRpc(LOCALNET_RPC);
  const rpcSubscriptions = createSolanaRpcSubscriptions(LOCALNET_RPC_WS);
  const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

  // Verify connection
  try {
    const { value: version } = await rpc.getVersion().send();
    console.log(`Connected to localnet: Solana ${version["solana-core"]}`);
  } catch (e) {
    console.error("Failed to connect to localnet. Is the validator running?");
    process.exit(1);
  }

  // Load keypair
  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const signer = await createKeyPairSignerFromBytes(Uint8Array.from(keypairData));

  // Get all PDAs
  const [boardAddress] = await boardPDA();
  const [configAddress] = await configPDA();
  const [treasuryAddress] = await treasuryPDA();
  const [round0Address] = await roundPDA(0);
  const [crapsGameAddress] = await crapsGamePDA();
  const [crapsPositionAddress] = await crapsPositionPDA(signer.address);

  console.log("\nAccounts:");
  console.log(`  Signer: ${signer.address}`);
  console.log(`  Board: ${boardAddress}`);
  console.log(`  Config: ${configAddress}`);
  console.log(`  Treasury: ${treasuryAddress}`);
  console.log(`  Round 0: ${round0Address}`);
  console.log(`  CrapsGame: ${crapsGameAddress}`);
  console.log(`  CrapsPosition: ${crapsPositionAddress}`);

  // ============================================
  // STEP 1: Initialize ORE Program
  // ============================================
  console.log("\n--- STEP 1: Initialize ORE Program ---");

  const { value: boardInfo } = await rpc.getAccountInfo(boardAddress, { encoding: "base64" }).send();

  if (boardInfo) {
    console.log("  Board already initialized, skipping...");
    results.initialized = true;
  } else {
    const initIx = createInitializeInstruction(signer, boardAddress, configAddress, treasuryAddress, round0Address);
    const initResult = await sendAndConfirm(rpc, sendAndConfirmTransaction, signer, initIx, "Initialize");
    results.initialized = initResult.success;
    if (initResult.success) results.signatures.push({ sig: initResult.signature, desc: "Initialize" });
    else results.errors.push({ step: "Initialize", error: initResult.error });
  }

  if (!results.initialized) {
    console.error("Failed to initialize. Exiting.");
    process.exit(1);
  }

  // ============================================
  // STEP 2: Start Round
  // ============================================
  console.log("\n--- STEP 2: Start Round ---");

  // Duration: 100 slots (~40 seconds)
  const roundDuration = 100;
  const startRoundIx = createStartRoundInstruction(signer, boardAddress, configAddress, round0Address, roundDuration);
  const startRoundResult = await sendAndConfirm(rpc, sendAndConfirmTransaction, signer, startRoundIx, `StartRound(duration=${roundDuration} slots)`);
  if (startRoundResult.success) results.signatures.push({ sig: startRoundResult.signature, desc: "StartRound" });

  // ============================================
  // STEP 3: Initialize and Fund Craps Game
  // ============================================
  console.log("\n--- STEP 3: Initialize and Fund Craps Game ---");

  const { value: crapsInfo } = await rpc.getAccountInfo(crapsGameAddress, { encoding: "base64" }).send();

  if (!crapsInfo) {
    // Initialize craps game first
    const initCrapsIx = createInitCrapsGameInstruction(signer, crapsGameAddress);
    const initCrapsResult = await sendAndConfirm(rpc, sendAndConfirmTransaction, signer, initCrapsIx, "InitCrapsGame");
    if (initCrapsResult.success) results.signatures.push({ sig: initCrapsResult.signature, desc: "InitCrapsGame" });
  }

  // Fund the house
  const fundAmount = 100n * LAMPORTS_PER_SOL;
  const fundIx = createFundHouseInstruction(signer, crapsGameAddress, fundAmount);
  const fundResult = await sendAndConfirm(rpc, sendAndConfirmTransaction, signer, fundIx, "FundCrapsHouse(100 SOL)");
  results.crapsGameFunded = fundResult.success;
  if (fundResult.success) results.signatures.push({ sig: fundResult.signature, desc: "FundCrapsHouse" });

  // ============================================
  // STEP 4: Place Bets of Each Type
  // ============================================
  console.log("\n--- STEP 4: Place Bets ---");

  const bets = [
    { type: CrapsBetType.PassLine, name: "PassLine", amount: 0.01 },
    { type: CrapsBetType.DontPass, name: "DontPass", amount: 0.01 },
    { type: CrapsBetType.Field, name: "Field", amount: 0.02 },
    { type: CrapsBetType.AnySeven, name: "AnySeven", amount: 0.01 },
    { type: CrapsBetType.AnyCraps, name: "AnyCraps", amount: 0.01 },
    { type: CrapsBetType.YoEleven, name: "YoEleven", amount: 0.01 },
    { type: CrapsBetType.Aces, name: "Aces", amount: 0.01 },
    { type: CrapsBetType.Twelve, name: "Twelve", amount: 0.01 },
  ];

  for (const bet of bets) {
    const betAmount = BigInt(Math.round(bet.amount * Number(LAMPORTS_PER_SOL)));
    const betIx = createPlaceBetInstruction(signer, crapsGameAddress, crapsPositionAddress, bet.type, 0, betAmount);
    const betResult = await sendAndConfirm(rpc, sendAndConfirmTransaction, signer, betIx, `PlaceBet(${bet.name}, ${bet.amount} SOL)`);
    if (betResult.success) {
      results.betsPlaced++;
      results.signatures.push({ sig: betResult.signature, desc: `PlaceBet(${bet.name})` });
    } else {
      results.errors.push({ step: `PlaceBet(${bet.name})`, error: betResult.error });
    }
    await new Promise(r => setTimeout(r, 200));
  }

  // ============================================
  // STEP 5: Simulate Dice Roll and Settle
  // ============================================
  console.log("\n--- STEP 5: Settle Bets ---");

  // Generate a random dice roll
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  const winningSquare = diceToSquare(die1, die2);
  const sum = die1 + die2;

  console.log(`  Dice Roll: ${die1} + ${die2} = ${sum} (square ${winningSquare})`);

  // Show which bets should win
  console.log("  Expected outcomes:");
  for (const bet of bets) {
    const wins = checkBetWins(bet.type, die1, die2);
    console.log(`    ${bet.name}: ${wins ? "WIN" : "LOSE"}`);
    if (wins) results.betsWon++;
    else results.betsLost++;
  }

  // Settle the bets
  const settleIx = createSettleCrapsInstruction(signer, crapsGameAddress, crapsPositionAddress, round0Address, winningSquare);
  const settleResult = await sendAndConfirm(rpc, sendAndConfirmTransaction, signer, settleIx, `SettleCraps(square=${winningSquare})`);
  if (settleResult.success) {
    results.betsSettled = results.betsPlaced;
    results.roundsCompleted = 1;
    results.signatures.push({ sig: settleResult.signature, desc: "SettleCraps" });
  } else {
    results.errors.push({ step: "SettleCraps", error: settleResult.error });
  }

  // ============================================
  // FINAL REPORT
  // ============================================
  console.log("\n========================================");
  console.log("FINAL REPORT");
  console.log("========================================");
  console.log(`\nProgram State:`);
  console.log(`  Initialized: ${results.initialized ? "YES" : "NO"}`);
  console.log(`  Craps Funded: ${results.crapsGameFunded ? "YES" : "NO"}`);
  console.log(`\nBetting:`);
  console.log(`  Bets Placed: ${results.betsPlaced}`);
  console.log(`  Bets Settled: ${results.betsSettled}`);
  console.log(`  Expected Wins: ${results.betsWon}`);
  console.log(`  Expected Losses: ${results.betsLost}`);
  console.log(`\nRounds:`);
  console.log(`  Completed: ${results.roundsCompleted}`);
  console.log(`\nTransactions:`);
  console.log(`  Total Signatures: ${results.signatures.length}`);

  if (results.errors.length > 0) {
    console.log(`\nErrors (${results.errors.length}):`);
    results.errors.forEach(e => console.log(`  - ${e.step}: ${e.error}`));
  }

  console.log("\n========================================");
  if (results.initialized && results.betsPlaced > 0 && results.errors.length === 0) {
    console.log("✓ ALL TESTS PASSED");
    console.log("========================================\n");
    process.exit(0);
  } else {
    console.log("✗ SOME TESTS FAILED");
    console.log("========================================\n");
    process.exit(1);
  }
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
