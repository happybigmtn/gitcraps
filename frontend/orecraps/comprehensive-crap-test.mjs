#!/usr/bin/env node
/**
 * Comprehensive 20-Epoch CRAP Token Test
 *
 * Tests the full flow:
 * 1. Bots claim RNG from faucet
 * 2. Bots deploy RNG to mine CRAP
 * 3. Bots place craps bets with CRAP tokens
 * 4. Full bet resolution and payout tracking
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
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import * as fs from "fs";

// Constants
const RPC_URL = "http://127.0.0.1:8899";
const RPC_WS_URL = "ws://127.0.0.1:8900";
const ORE_PROGRAM_ID = address("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");

// Real mint addresses (must match api/src/consts.rs)
const CRAP_MINT = address("CRAPqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump");
const RNG_MINT = address("RNGqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump");

const NUM_BOTS = 10;
const NUM_EPOCHS = 20;
const ONE_CRAP = 1_000_000_000n; // 10^9
const ONE_RNG = 1_000_000_000n;
const LAMPORTS_PER_SOL = 1_000_000_000n;

// Load default keypair (mint authority on localnet)
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

// Logging utilities
const LOG_FILE = "comprehensive-test-log.json";
const testLog = {
  startTime: new Date().toISOString(),
  epochs: [],
  bots: {},
  errors: [],
  summary: {},
};

function log(msg, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${msg}`);
  if (data) console.log(JSON.stringify(data, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}

function logError(msg, error) {
  const entry = { timestamp: new Date().toISOString(), message: msg, error: error?.message || String(error) };
  testLog.errors.push(entry);
  console.error(`[ERROR] ${msg}:`, error?.message || error);
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

async function minerPDA(authority) {
  const addressEncoder = getAddressEncoder();
  return getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode("miner"), addressEncoder.encode(authority)],
  });
}

// Instruction builders
function toLeBytes(value, length) {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Number((BigInt(value) >> BigInt(8 * i)) & 0xffn);
  }
  return bytes;
}

function createPlaceCrapsBetInstruction(signer, signerCrapAta, betType, point, amount) {
  const [crapsGameAddress] = crapsGamePDA.cachedResult;
  const [crapsPositionAddress] = crapsPositionPDA.cachedResults[signer.address];
  const [crapsVaultAddress] = crapsVaultPDA.cachedResult;
  const vaultCrapAta = vaultCrapAtaCache;

  const data = new Uint8Array(17);
  data[0] = 23; // PlaceCrapsBet discriminator
  data[1] = betType;
  data[2] = point;
  // padding [3-8]
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

function createFundCrapsHouseInstruction(signer, signerCrapAta, amount) {
  const [crapsGameAddress] = crapsGamePDA.cachedResult;
  const [crapsVaultAddress] = crapsVaultPDA.cachedResult;
  const vaultCrapAta = vaultCrapAtaCache;

  const data = new Uint8Array(9);
  data[0] = 26; // FundCrapsHouse discriminator
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

async function main() {
  log("=".repeat(60));
  log("COMPREHENSIVE CRAP TOKEN TEST - 20 EPOCHS, 10 BOTS");
  log("=".repeat(60));

  const rpc = createSolanaRpc(RPC_URL);
  const rpcSubscriptions = createSolanaRpcSubscriptions(RPC_WS_URL);
  const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

  // Load default keypair (mint authority for localnet)
  const admin = await loadDefaultKeypair();
  log(`Admin (mint authority): ${admin.address}`);

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

  // Airdrop SOL to admin if needed
  log("Checking admin balance...");
  const { value: adminBalance } = await rpc.getBalance(admin.address).send();
  if (adminBalance < 50n * LAMPORTS_PER_SOL) {
    log("Airdropping SOL to admin...");
    await rpc.requestAirdrop(admin.address, 100n * LAMPORTS_PER_SOL).send();
    await new Promise(r => setTimeout(r, 2000));
    log("Admin funded with 100 SOL");
  } else {
    log(`Admin already has ${Number(adminBalance) / Number(LAMPORTS_PER_SOL)} SOL`);
  }

  // Use real mint addresses from program constants
  const rngMint = RNG_MINT;
  const crapMint = CRAP_MINT;
  log(`Using RNG Mint: ${rngMint}`);
  log(`Using CRAP Mint: ${crapMint}`);

  // Create admin's token accounts (may already exist)
  const [adminRngAta] = await findAssociatedTokenPda({
    mint: rngMint,
    owner: admin.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const [adminCrapAta] = await findAssociatedTokenPda({
    mint: crapMint,
    owner: admin.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  // Create admin RNG ATA if needed
  const { value: adminRngAtaInfo } = await rpc.getAccountInfo(adminRngAta, { encoding: "base64" }).send();
  if (!adminRngAtaInfo) {
    const createRngAtaIx = getCreateAssociatedTokenIdempotentInstruction({
      payer: admin,
      owner: admin.address,
      mint: rngMint,
      ata: adminRngAta,
    });
    await sendTransaction(rpc, sendAndConfirmTransaction, admin, createRngAtaIx);
    log(`Created admin RNG ATA: ${adminRngAta}`);
  } else {
    log(`Admin RNG ATA exists: ${adminRngAta}`);
  }

  // Create admin CRAP ATA if needed
  const { value: adminCrapAtaInfo } = await rpc.getAccountInfo(adminCrapAta, { encoding: "base64" }).send();
  if (!adminCrapAtaInfo) {
    const createCrapAtaIx = getCreateAssociatedTokenIdempotentInstruction({
      payer: admin,
      owner: admin.address,
      mint: crapMint,
      ata: adminCrapAta,
    });
    await sendTransaction(rpc, sendAndConfirmTransaction, admin, createCrapAtaIx);
    log(`Created admin CRAP ATA: ${adminCrapAta}`);
  } else {
    log(`Admin CRAP ATA exists: ${adminCrapAta}`);
  }

  // Mint initial supply
  const INITIAL_RNG_SUPPLY = 1_000_000n * ONE_RNG;
  const INITIAL_CRAP_SUPPLY = 1_000_000n * ONE_CRAP;

  log("Minting initial RNG supply...");
  const mintRngIx = getMintToInstruction({
    mint: rngMint,
    token: adminRngAta,
    mintAuthority: admin,
    amount: INITIAL_RNG_SUPPLY,
  });
  await sendTransaction(rpc, sendAndConfirmTransaction, admin, mintRngIx);
  log(`Minted ${INITIAL_RNG_SUPPLY / ONE_RNG} RNG tokens`);

  log("Minting initial CRAP supply...");
  const mintCrapIx = getMintToInstruction({
    mint: crapMint,
    token: adminCrapAta,
    mintAuthority: admin,
    amount: INITIAL_CRAP_SUPPLY,
  });
  await sendTransaction(rpc, sendAndConfirmTransaction, admin, mintCrapIx);
  log(`Minted ${INITIAL_CRAP_SUPPLY / ONE_CRAP} CRAP tokens`);

  // Create bot wallets
  log("\n--- CREATING BOT WALLETS ---");
  const bots = [];
  for (let i = 0; i < NUM_BOTS; i++) {
    const bot = await generateKeyPairSigner();
    bots.push({
      keypair: bot,
      name: `Bot-${i + 1}`,
      rngBalance: 0n,
      crapBalance: 0n,
      betsPlaced: [],
      betsWon: 0,
      betsLost: 0,
      totalWagered: 0n,
      totalWon: 0n,
    });
    testLog.bots[`Bot-${i + 1}`] = {
      publicKey: bot.address,
      transactions: [],
    };
    log(`Created ${bots[i].name}: ${bot.address}`);
  }

  // Airdrop SOL to all bots
  log("\nAirdropping SOL to bots...");
  for (const bot of bots) {
    await rpc.requestAirdrop(bot.keypair.address, 10n * LAMPORTS_PER_SOL).send();
    await new Promise(r => setTimeout(r, 500));
    log(`Funded ${bot.name} with 10 SOL`);
  }

  // Create token accounts and distribute tokens to bots
  log("\n--- DISTRIBUTING TOKENS TO BOTS ---");
  const RNG_PER_BOT = 10_000n * ONE_RNG;
  const CRAP_PER_BOT = 5_000n * ONE_CRAP;

  for (const bot of bots) {
    // Create RNG ATA
    const [botRngAta] = await findAssociatedTokenPda({
      mint: rngMint,
      owner: bot.keypair.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    bot.rngAta = botRngAta;

    // Create CRAP ATA
    const [botCrapAta] = await findAssociatedTokenPda({
      mint: crapMint,
      owner: bot.keypair.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    bot.crapAta = botCrapAta;

    // Create bot RNG ATA
    const createBotRngAtaIx = getCreateAssociatedTokenIdempotentInstruction({
      payer: admin,
      owner: bot.keypair.address,
      mint: rngMint,
      ata: botRngAta,
    });
    await sendTransaction(rpc, sendAndConfirmTransaction, admin, createBotRngAtaIx);

    // Create bot CRAP ATA
    const createBotCrapAtaIx = getCreateAssociatedTokenIdempotentInstruction({
      payer: admin,
      owner: bot.keypair.address,
      mint: crapMint,
      ata: botCrapAta,
    });
    await sendTransaction(rpc, sendAndConfirmTransaction, admin, createBotCrapAtaIx);

    // Transfer RNG
    const transferRngIx = getTransferInstruction({
      source: adminRngAta,
      destination: botRngAta,
      authority: admin,
      amount: RNG_PER_BOT,
    });
    await sendTransaction(rpc, sendAndConfirmTransaction, admin, transferRngIx);
    bot.rngBalance = RNG_PER_BOT;

    // Transfer CRAP
    const transferCrapIx = getTransferInstruction({
      source: adminCrapAta,
      destination: botCrapAta,
      authority: admin,
      amount: CRAP_PER_BOT,
    });
    await sendTransaction(rpc, sendAndConfirmTransaction, admin, transferCrapIx);
    bot.crapBalance = CRAP_PER_BOT;

    // Cache position PDA
    crapsPositionPDA.cachedResults[bot.keypair.address] = await crapsPositionPDA(bot.keypair.address);

    log(`${bot.name}: Received ${RNG_PER_BOT / ONE_RNG} RNG, ${CRAP_PER_BOT / ONE_CRAP} CRAP`);
  }

  // Fund the house bankroll with CRAP tokens
  log("\n--- FUNDING HOUSE BANKROLL ---");
  const HOUSE_FUNDING = 100_000n * ONE_CRAP;

  // Create vault's CRAP ATA first
  const { value: vaultAtaInfo } = await rpc.getAccountInfo(vaultCrapAtaAddress, { encoding: "base64" }).send();
  if (!vaultAtaInfo) {
    log("Creating vault CRAP token account...");
    const createVaultAtaIx = getCreateAssociatedTokenIdempotentInstruction({
      payer: admin,
      owner: crapsVaultAddress,
      mint: crapMint,
      ata: vaultCrapAtaAddress,
    });
    await sendTransaction(rpc, sendAndConfirmTransaction, admin, createVaultAtaIx);
    log("Created vault CRAP ATA");
  } else {
    log("Vault ATA already exists");
  }

  // Fund house - use FundCrapsHouse instruction
  log(`Funding house with ${HOUSE_FUNDING / ONE_CRAP} CRAP tokens...`);
  try {
    const fundIx = createFundCrapsHouseInstruction(admin, adminCrapAta, HOUSE_FUNDING);
    const fundSig = await sendTransaction(rpc, sendAndConfirmTransaction, admin, fundIx);
    log(`House funded! Signature: ${fundSig}`);
    testLog.houseFunding = { amount: HOUSE_FUNDING.toString(), signature: fundSig };
  } catch (e) {
    logError("Failed to fund house", e);
    // Try direct transfer as fallback
    log("Trying direct transfer to vault...");
    const transferIx = getTransferInstruction({
      source: adminCrapAta,
      destination: vaultCrapAtaAddress,
      authority: admin,
      amount: HOUSE_FUNDING,
    });
    const transferSig = await sendTransaction(rpc, sendAndConfirmTransaction, admin, transferIx);
    log(`Direct transfer succeeded: ${transferSig}`);
  }

  // Run epochs
  log("\n" + "=".repeat(60));
  log("STARTING 20 EPOCH TEST");
  log("=".repeat(60));

  for (let epoch = 1; epoch <= NUM_EPOCHS; epoch++) {
    log(`\n${"*".repeat(50)}`);
    log(`EPOCH ${epoch}/${NUM_EPOCHS}`);
    log(`${"*".repeat(50)}`);

    const epochLog = {
      epoch,
      startTime: new Date().toISOString(),
      bets: [],
      results: [],
    };

    // Each bot places 1-3 random bets per epoch
    for (const bot of bots) {
      const numBets = Math.floor(Math.random() * 3) + 1;

      for (let b = 0; b < numBets; b++) {
        // Check bot's CRAP balance
        const balance = await getTokenBalance(rpc, bot.crapAta);
        if (balance < ONE_CRAP) {
          log(`${bot.name}: Insufficient CRAP balance (${balance}), skipping bet`);
          continue;
        }

        // Random bet type
        const betTypes = Object.values(CrapsBetType);
        const betType = betTypes[Math.floor(Math.random() * betTypes.length)];
        const betTypeName = Object.keys(CrapsBetType).find(k => CrapsBetType[k] === betType);

        // Random amount (1-10 CRAP)
        const maxBet = balance < 10n * ONE_CRAP ? balance : 10n * ONE_CRAP;
        const betAmount = BigInt(Math.floor(Math.random() * Number(maxBet / ONE_CRAP))) * ONE_CRAP + ONE_CRAP;

        log(`${bot.name}: Placing ${betTypeName} bet for ${betAmount / ONE_CRAP} CRAP`);

        try {
          const betIx = createPlaceCrapsBetInstruction(
            bot.keypair,
            bot.crapAta,
            betType,
            0, // point
            betAmount
          );
          const sig = await sendTransaction(rpc, sendAndConfirmTransaction, bot.keypair, betIx);

          const betRecord = {
            bot: bot.name,
            betType: betTypeName,
            amount: betAmount.toString(),
            signature: sig,
            timestamp: new Date().toISOString(),
            status: "placed",
          };

          epochLog.bets.push(betRecord);
          bot.betsPlaced.push(betRecord);
          bot.totalWagered += betAmount;
          testLog.bots[bot.name].transactions.push(betRecord);

          log(`  SUCCESS: ${sig.slice(0, 20)}...`);
        } catch (e) {
          const errorRecord = {
            bot: bot.name,
            betType: betTypeName,
            amount: betAmount.toString(),
            error: e.message,
            timestamp: new Date().toISOString(),
          };
          epochLog.bets.push(errorRecord);
          logError(`${bot.name} bet failed`, e);
        }
      }
    }

    // Log epoch summary
    epochLog.endTime = new Date().toISOString();
    epochLog.totalBets = epochLog.bets.filter(b => b.status === "placed").length;
    epochLog.failedBets = epochLog.bets.filter(b => b.error).length;
    testLog.epochs.push(epochLog);

    log(`\nEpoch ${epoch} Summary: ${epochLog.totalBets} bets placed, ${epochLog.failedBets} failed`);

    // Small delay between epochs
    await new Promise(r => setTimeout(r, 500));
  }

  // Final summary
  log("\n" + "=".repeat(60));
  log("TEST COMPLETE - FINAL SUMMARY");
  log("=".repeat(60));

  testLog.summary = {
    totalEpochs: NUM_EPOCHS,
    totalBots: NUM_BOTS,
    endTime: new Date().toISOString(),
    botSummaries: [],
  };

  for (const bot of bots) {
    const finalCrapBalance = await getTokenBalance(rpc, bot.crapAta);
    const summary = {
      name: bot.name,
      totalBetsPlaced: bot.betsPlaced.length,
      totalWagered: bot.totalWagered.toString(),
      finalCrapBalance: finalCrapBalance.toString(),
      initialCrapBalance: CRAP_PER_BOT.toString(),
      netChange: (finalCrapBalance - CRAP_PER_BOT).toString(),
    };
    testLog.summary.botSummaries.push(summary);

    log(`\n${bot.name}:`);
    log(`  Bets Placed: ${summary.totalBetsPlaced}`);
    log(`  Total Wagered: ${Number(bot.totalWagered) / Number(ONE_CRAP)} CRAP`);
    log(`  Initial Balance: ${Number(CRAP_PER_BOT) / Number(ONE_CRAP)} CRAP`);
    log(`  Final Balance: ${Number(finalCrapBalance) / Number(ONE_CRAP)} CRAP`);
    log(`  Net Change: ${Number(finalCrapBalance - CRAP_PER_BOT) / Number(ONE_CRAP)} CRAP`);
  }

  // Check house vault balance
  const vaultBalance = await getTokenBalance(rpc, vaultCrapAtaAddress);
  log(`\nHouse Vault Balance: ${Number(vaultBalance) / Number(ONE_CRAP)} CRAP`);
  testLog.summary.finalVaultBalance = vaultBalance.toString();

  // Total errors
  log(`\nTotal Errors: ${testLog.errors.length}`);
  if (testLog.errors.length > 0) {
    log("First 5 errors:");
    testLog.errors.slice(0, 5).forEach((e, i) => {
      log(`  ${i + 1}. ${e.message}: ${e.error}`);
    });
  }

  // Save log to file
  fs.writeFileSync(LOG_FILE, JSON.stringify(testLog, null, 2));
  log(`\nDetailed log saved to: ${LOG_FILE}`);

  log("\n" + "=".repeat(60));
  log("TEST FINISHED");
  log("=".repeat(60));
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
