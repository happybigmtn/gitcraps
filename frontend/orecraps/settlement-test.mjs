#!/usr/bin/env node
/**
 * Settlement Test Script for Localnet
 *
 * Tests the full bet resolution flow:
 * 1. Place bets
 * 2. Inject slot_hash into Round account
 * 3. Call SettleCraps for each bot
 * 4. Call ClaimCrapsWinnings for each bot
 */

import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  address,
  getProgramDerivedAddress,
  getAddressEncoder,
  createKeyPairSignerFromBytes,
  generateKeyPairSigner,
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
import {
  TOKEN_PROGRAM_ADDRESS,
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getMintToInstruction,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferInstruction,
} from "@solana-program/token";
import { SYSTEM_PROGRAM_ADDRESS, getTransferSolInstruction } from "@solana-program/system";
import * as fs from "fs";
import crypto from "crypto";

// Constants
const RPC_URL = "http://127.0.0.1:8899";
const RPC_WS_URL = "ws://127.0.0.1:8900";
const ORE_PROGRAM_ID = address("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const CRAP_MINT = address("CRAPqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump");
const RNG_MINT = address("RNGqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump");

const NUM_BOTS = 5;
const ONE_CRAP = 1_000_000_000n;
const LAMPORTS_PER_SOL = 1_000_000_000n;

// Load keypair
async function loadDefaultKeypair() {
  const keypairPath = process.env.HOME + "/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  return createKeyPairSignerFromBytes(Uint8Array.from(keypairData));
}

// Bet types
const CrapsBetType = {
  PassLine: 0,
  DontPass: 1,
  Field: 10,
  AnySeven: 11,
  AnyCraps: 12,
  YoEleven: 13,
};

function log(msg, data = null) {
  const timestamp = new Date().toISOString().slice(11, 23);
  console.log(`[${timestamp}] ${msg}`);
  if (data) console.log(JSON.stringify(data, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}

// PDA derivations
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

async function crapsVaultPDA() {
  return getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode("craps_vault")],
  });
}

async function boardPDA() {
  return getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode("board")],
  });
}

async function roundPDA(roundId) {
  const buffer = toLeBytes(BigInt(roundId), 8);
  return getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode("round"), buffer],
  });
}

function toLeBytes(value, length) {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Number((BigInt(value) >> BigInt(8 * i)) & 0xffn);
  }
  return bytes;
}

// Calculate winning square from slot hash (must match on-chain logic)
function calculateWinningSquare(slotHash) {
  // Use keccak256 (approximated with sha3-256)
  const hash = crypto.createHash("sha3-256").update(slotHash).digest();
  const sample = hash.readBigUInt64LE(0);

  const boardSize = 36n;
  const maxValid = (0xffffffffffffffffn / boardSize) * boardSize;

  if (sample < maxValid) {
    return Number(sample % boardSize);
  } else {
    const hash2 = crypto.createHash("sha3-256").update(hash).digest();
    const sample2 = hash2.readBigUInt64LE(0);
    return Number(sample2 % boardSize);
  }
}

// Convert winning square to dice
function squareToDice(square) {
  const die1 = Math.floor(square / 6) + 1;
  const die2 = (square % 6) + 1;
  return [die1, die2, die1 + die2];
}

// Instruction builders
function createPlaceCrapsBetInstruction(signer, signerCrapAta, betType, point, amount) {
  const [crapsGameAddress] = crapsGamePDA.cachedResult;
  const [crapsPositionAddress] = crapsPositionPDA.cachedResults[signer.address];
  const [crapsVaultAddress] = crapsVaultPDA.cachedResult;
  const vaultCrapAta = vaultCrapAtaCache;

  const data = new Uint8Array(17);
  data[0] = 23; // PlaceCrapsBet
  data[1] = betType;
  data[2] = point;
  data.set(toLeBytes(amount, 8), 9);

  return {
    programAddress: ORE_PROGRAM_ID,
    accounts: [
      { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
      { address: crapsGameAddress, role: AccountRole.WRITABLE },
      { address: crapsPositionAddress, role: AccountRole.WRITABLE },
      { address: crapsVaultAddress, role: AccountRole.READONLY },
      { address: signerCrapAta, role: AccountRole.WRITABLE },
      { address: vaultCrapAta, role: AccountRole.WRITABLE },
      { address: CRAP_MINT, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: ASSOCIATED_TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  };
}

function createSettleCrapsInstruction(signer, roundAddress, winningSquare) {
  const [crapsGameAddress] = crapsGamePDA.cachedResult;
  const [crapsPositionAddress] = crapsPositionPDA.cachedResults[signer.address];

  const data = new Uint8Array(9);
  data[0] = 24; // SettleCraps
  data.set(toLeBytes(winningSquare, 8), 1);

  return {
    programAddress: ORE_PROGRAM_ID,
    accounts: [
      { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
      { address: crapsGameAddress, role: AccountRole.WRITABLE },
      { address: crapsPositionAddress, role: AccountRole.WRITABLE },
      { address: roundAddress, role: AccountRole.READONLY },
    ],
    data,
  };
}

function createClaimCrapsWinningsInstruction(signer, signerCrapAta) {
  const [crapsGameAddress] = crapsGamePDA.cachedResult;
  const [crapsPositionAddress] = crapsPositionPDA.cachedResults[signer.address];
  const [crapsVaultAddress] = crapsVaultPDA.cachedResult;
  const vaultCrapAta = vaultCrapAtaCache;

  const data = new Uint8Array(1);
  data[0] = 25; // ClaimCrapsWinnings

  return {
    programAddress: ORE_PROGRAM_ID,
    accounts: [
      { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
      { address: crapsGameAddress, role: AccountRole.WRITABLE },
      { address: crapsPositionAddress, role: AccountRole.WRITABLE },
      { address: crapsVaultAddress, role: AccountRole.READONLY },
      { address: vaultCrapAta, role: AccountRole.WRITABLE },
      { address: signerCrapAta, role: AccountRole.WRITABLE },
      { address: CRAP_MINT, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  };
}

function createFundCrapsHouseInstruction(signer, signerCrapAta, amount) {
  const [crapsGameAddress] = crapsGamePDA.cachedResult;
  const [crapsVaultAddress] = crapsVaultPDA.cachedResult;
  const vaultCrapAta = vaultCrapAtaCache;

  const data = new Uint8Array(9);
  data[0] = 26; // FundCrapsHouse
  data.set(toLeBytes(amount, 8), 1);

  return {
    programAddress: ORE_PROGRAM_ID,
    accounts: [
      { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
      { address: crapsGameAddress, role: AccountRole.WRITABLE },
      { address: crapsVaultAddress, role: AccountRole.READONLY },
      { address: signerCrapAta, role: AccountRole.WRITABLE },
      { address: vaultCrapAta, role: AccountRole.WRITABLE },
      { address: CRAP_MINT, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: ASSOCIATED_TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  };
}

// PDA caches
crapsGamePDA.cachedResult = null;
crapsVaultPDA.cachedResult = null;
crapsPositionPDA.cachedResults = {};
let vaultCrapAtaCache = null;

async function sendTransaction(rpc, sendAndConfirmTransaction, signer, instruction) {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const tx = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstruction(instruction, m),
  );

  const signedTx = await signTransactionMessageWithSigners(tx);
  const sig = getSignatureFromTransaction(signedTx);
  await sendAndConfirmTransaction(signedTx, { commitment: "confirmed" });
  return sig;
}

async function getTokenBalance(rpc, ata) {
  try {
    const { value } = await rpc.getTokenAccountBalance(ata).send();
    return BigInt(value.amount);
  } catch {
    return 0n;
  }
}

// Load pre-configured entropy metadata from file
function loadEntropyMeta(roundId) {
  const paths = [
    `/home/r/Coding/ore/.localnet-accounts-initialized/round-${roundId}-with-entropy-meta.json`,
    `/home/r/Coding/ore/.localnet-accounts/round-${roundId}-with-entropy-meta.json`,
    "/home/r/Coding/ore/.localnet-accounts-initialized/round-0-with-entropy-meta.json",
    "/home/r/Coding/ore/.localnet-accounts/round-0-with-entropy-meta.json",
  ];
  for (const metaPath of paths) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      log(`Loaded entropy metadata from ${metaPath}`);
      return meta;
    } catch (e) {
      // Try next path
    }
  }
  log("No entropy metadata found in any location");
  return null;
}

async function main() {
  log("=" .repeat(60));
  log("SETTLEMENT TEST - Full Bet Resolution");
  log("=".repeat(60));

  const rpc = createSolanaRpc(RPC_URL);
  const rpcSubscriptions = createSolanaRpcSubscriptions(RPC_WS_URL);
  const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

  const admin = await loadDefaultKeypair();
  log(`Admin: ${admin.address}`);

  // Cache PDAs
  crapsGamePDA.cachedResult = await crapsGamePDA();
  crapsVaultPDA.cachedResult = await crapsVaultPDA();
  const [crapsVaultAddress] = crapsVaultPDA.cachedResult;

  // Get vault CRAP ATA
  const [vaultCrapAtaAddress] = await findAssociatedTokenPda({
    mint: CRAP_MINT,
    owner: crapsVaultAddress,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  vaultCrapAtaCache = vaultCrapAtaAddress;

  // Airdrop SOL to admin
  const { value: adminBalance } = await rpc.getBalance(admin.address).send();
  if (adminBalance < 10n * LAMPORTS_PER_SOL) {
    log("Requesting airdrop for admin...");
    const sig = await rpc.requestAirdrop(admin.address, 100n * LAMPORTS_PER_SOL).send();
    // Wait for confirmation
    await new Promise(r => setTimeout(r, 2000));
    log("Admin funded with SOL");
  }

  // Create/get admin token accounts
  const [adminCrapAta] = await findAssociatedTokenPda({
    mint: CRAP_MINT,
    owner: admin.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  // Create admin ATA if needed
  const { value: adminAtaInfo } = await rpc.getAccountInfo(adminCrapAta, { encoding: "base64" }).send();
  if (!adminAtaInfo) {
    const createAtaIx = getCreateAssociatedTokenIdempotentInstruction({
      payer: admin,
      owner: admin.address,
      mint: CRAP_MINT,
      ata: adminCrapAta,
    });
    await sendTransaction(rpc, sendAndConfirmTransaction, admin, createAtaIx);
    log("Created admin CRAP ATA");
  }

  // Mint CRAP tokens
  const INITIAL_CRAP = 1_000_000n * ONE_CRAP;
  const mintIx = getMintToInstruction({
    mint: CRAP_MINT,
    token: adminCrapAta,
    mintAuthority: admin,
    amount: INITIAL_CRAP,
  });
  await sendTransaction(rpc, sendAndConfirmTransaction, admin, mintIx);
  log(`Minted ${INITIAL_CRAP / ONE_CRAP} CRAP`);

  // Create vault ATA if needed
  const { value: vaultAtaInfo } = await rpc.getAccountInfo(vaultCrapAtaAddress, { encoding: "base64" }).send();
  if (!vaultAtaInfo) {
    const createVaultAtaIx = getCreateAssociatedTokenIdempotentInstruction({
      payer: admin,
      owner: crapsVaultAddress,
      mint: CRAP_MINT,
      ata: vaultCrapAtaAddress,
    });
    await sendTransaction(rpc, sendAndConfirmTransaction, admin, createVaultAtaIx);
    log("Created vault CRAP ATA");
  }

  // Fund house
  const HOUSE_FUNDING = 100_000n * ONE_CRAP;
  const fundIx = createFundCrapsHouseInstruction(admin, adminCrapAta, HOUSE_FUNDING);
  await sendTransaction(rpc, sendAndConfirmTransaction, admin, fundIx);
  log(`Funded house with ${HOUSE_FUNDING / ONE_CRAP} CRAP`);

  // Create bots
  const bots = [];
  const CRAP_PER_BOT = 1000n * ONE_CRAP;

  for (let i = 0; i < NUM_BOTS; i++) {
    const bot = await generateKeyPairSigner();

    // Fund bot with SOL
    const airdropSig = await rpc.requestAirdrop(bot.address, 5n * LAMPORTS_PER_SOL).send();
    await new Promise(r => setTimeout(r, 1000));

    // Create bot CRAP ATA
    const [botCrapAta] = await findAssociatedTokenPda({
      mint: CRAP_MINT,
      owner: bot.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });

    const createBotAtaIx = getCreateAssociatedTokenIdempotentInstruction({
      payer: admin,
      owner: bot.address,
      mint: CRAP_MINT,
      ata: botCrapAta,
    });
    await sendTransaction(rpc, sendAndConfirmTransaction, admin, createBotAtaIx);

    // Transfer CRAP to bot
    const transferIx = getTransferInstruction({
      source: adminCrapAta,
      destination: botCrapAta,
      authority: admin,
      amount: CRAP_PER_BOT,
    });
    await sendTransaction(rpc, sendAndConfirmTransaction, admin, transferIx);

    // Cache position PDA
    crapsPositionPDA.cachedResults[bot.address] = await crapsPositionPDA(bot.address);

    bots.push({
      name: `Bot-${i + 1}`,
      keypair: bot,
      crapAta: botCrapAta,
      initialBalance: CRAP_PER_BOT,
    });
    log(`Created ${bots[i].name}: ${CRAP_PER_BOT / ONE_CRAP} CRAP`);
  }

  // Get current round
  const [boardAddress] = await boardPDA();
  const { value: boardAccount } = await rpc.getAccountInfo(boardAddress, { encoding: "base64" }).send();
  const boardData = Buffer.from(boardAccount.data[0], "base64");
  const roundId = boardData.readBigUInt64LE(8); // After discriminator
  const [roundAddress] = await roundPDA(Number(roundId));
  log(`Current round: ${roundId}, address: ${roundAddress}`);

  // Place bets
  log("\n--- PLACING BETS ---");
  const betAmounts = {};

  for (const bot of bots) {
    const betAmount = 100n * ONE_CRAP;
    const betType = CrapsBetType.PassLine;

    try {
      const betIx = createPlaceCrapsBetInstruction(bot.keypair, bot.crapAta, betType, 0, betAmount);
      const sig = await sendTransaction(rpc, sendAndConfirmTransaction, bot.keypair, betIx);
      betAmounts[bot.name] = betAmount;
      log(`${bot.name} placed PassLine bet: ${betAmount / ONE_CRAP} CRAP - ${sig.slice(0, 20)}...`);
    } catch (e) {
      log(`${bot.name} bet failed: ${e.message}`);
    }
  }

  // Load pre-configured entropy metadata
  log("\n--- USING PRE-CONFIGURED ENTROPY ---");
  const entropyMeta = loadEntropyMeta(Number(roundId));
  if (!entropyMeta) {
    log("ERROR: No entropy metadata found!");
    log("Run: node /home/r/Coding/ore/scripts/create-round-with-slothash.mjs");
    log("Then restart validator with: --account <round-pda> round-0-with-entropy.json");
    return;
  }

  const winningSquare = entropyMeta.winningSquare;
  const die1 = entropyMeta.die1;
  const die2 = entropyMeta.die2;
  const diceSum = entropyMeta.diceSum;

  log(`Pre-configured dice: ${die1} + ${die2} = ${diceSum}`);
  log(`Winning square: ${winningSquare}`);

  // Settle bets
  log("\n--- SETTLING BETS ---");
  for (const bot of bots) {
    if (!betAmounts[bot.name]) continue;

    try {
      const settleIx = createSettleCrapsInstruction(bot.keypair, roundAddress, winningSquare);
      const sig = await sendTransaction(rpc, sendAndConfirmTransaction, bot.keypair, settleIx);
      log(`${bot.name} settled: ${sig.slice(0, 20)}...`);
    } catch (e) {
      log(`${bot.name} settle failed: ${e.message}`);
    }
  }

  // Claim winnings
  log("\n--- CLAIMING WINNINGS ---");
  for (const bot of bots) {
    if (!betAmounts[bot.name]) continue;

    try {
      const claimIx = createClaimCrapsWinningsInstruction(bot.keypair, bot.crapAta);
      const sig = await sendTransaction(rpc, sendAndConfirmTransaction, bot.keypair, claimIx);
      log(`${bot.name} claimed winnings: ${sig.slice(0, 20)}...`);
    } catch (e) {
      // May fail if no winnings
      if (!e.message.includes("No pending winnings")) {
        log(`${bot.name} claim failed: ${e.message}`);
      }
    }
  }

  // Final balances
  log("\n--- FINAL BALANCES ---");
  for (const bot of bots) {
    const finalBalance = await getTokenBalance(rpc, bot.crapAta);
    const change = finalBalance - bot.initialBalance;
    const changeStr = change >= 0 ? `+${change / ONE_CRAP}` : `${change / ONE_CRAP}`;
    log(`${bot.name}: ${finalBalance / ONE_CRAP} CRAP (${changeStr} change)`);
  }

  const vaultBalance = await getTokenBalance(rpc, vaultCrapAtaAddress);
  log(`\nHouse vault: ${vaultBalance / ONE_CRAP} CRAP`);

  log("\n" + "=".repeat(60));
  log("TEST COMPLETE");
  log("=".repeat(60));
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
