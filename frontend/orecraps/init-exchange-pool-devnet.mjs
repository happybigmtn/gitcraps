#!/usr/bin/env node
/**
 * Initialize Exchange Pool on Devnet
 *
 * Creates the SOL/RNG AMM pool with initial liquidity.
 *
 * Instructions:
 * - InitializeExchangePool = 76
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
import {
  TOKEN_PROGRAM_ADDRESS,
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getMintToInstruction,
} from "@solana-program/token";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import fs from "fs";

// Devnet configuration
const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const DEVNET_RPC_WS = "wss://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const ORE_PROGRAM_ID = address("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");

// Token mints
const RNG_MINT = address("8HJyJPD4iWD1X9FxZEjDuVpPqSBvNeaJCczXeK2xsShs");
const SOL_MINT = address("So11111111111111111111111111111111111111112"); // Wrapped SOL

// PDA seeds
const EXCHANGE_POOL = "exchange_pool";
const EXCHANGE_LP_MINT = "exchange_lp_mint";
const EXCHANGE_SOL_VAULT = "exchange_sol_vault";
const EXCHANGE_RNG_VAULT = "exchange_rng_vault";

// Helper functions
async function getPDA(seed) {
  return getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode(seed)],
  });
}

function toLeBytes(n, len) {
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = Number((n >> BigInt(8 * i)) & 0xffn);
  }
  return arr;
}

/**
 * Create InitializeExchangePool instruction
 *
 * Account layout (from initialize_pool.rs):
 * 0: admin (signer, payer)
 * 1: exchange_pool (PDA, writable)
 * 2: lp_mint (PDA, writable)
 * 3: sol_vault (PDA, writable) - wrapped SOL account
 * 4: rng_vault (PDA, writable) - RNG token account
 * 5: admin_rng_ata (writable) - admin's RNG source
 * 6: admin_lp_ata (writable) - admin's LP destination
 * 7: rng_mint - RNG token mint
 * 8: sol_mint - wrapped SOL mint (native)
 * 9: system_program
 * 10: token_program
 * 11: associated_token_program
 * 12: rent
 */
async function createInitializeExchangePoolInstruction(admin, solAmount, rngAmount) {
  const [exchangePoolAddress] = await getPDA(EXCHANGE_POOL);
  const [lpMintAddress] = await getPDA(EXCHANGE_LP_MINT);
  const [solVaultAddress] = await getPDA(EXCHANGE_SOL_VAULT);
  const [rngVaultAddress] = await getPDA(EXCHANGE_RNG_VAULT);

  // Admin ATAs
  const [adminRngAta] = await findAssociatedTokenPda({
    mint: RNG_MINT,
    owner: admin.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const [adminLpAta] = await findAssociatedTokenPda({
    mint: lpMintAddress,
    owner: admin.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  // Instruction data: discriminator(1) + sol_amount(8) + rng_amount(8)
  const data = new Uint8Array(17);
  data[0] = 76; // InitializeExchangePool discriminator
  data.set(toLeBytes(BigInt(solAmount), 8), 1);
  data.set(toLeBytes(BigInt(rngAmount), 8), 9);

  return {
    programAddress: ORE_PROGRAM_ID,
    accounts: [
      { address: admin.address, role: AccountRole.WRITABLE_SIGNER, signer: admin },
      { address: exchangePoolAddress, role: AccountRole.WRITABLE },
      { address: lpMintAddress, role: AccountRole.WRITABLE },
      { address: solVaultAddress, role: AccountRole.WRITABLE },
      { address: rngVaultAddress, role: AccountRole.WRITABLE },
      { address: adminRngAta, role: AccountRole.WRITABLE },
      { address: adminLpAta, role: AccountRole.WRITABLE },
      { address: RNG_MINT, role: AccountRole.READONLY },
      { address: SOL_MINT, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: ASSOCIATED_TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: address("SysvarRent111111111111111111111111111111111"), role: AccountRole.READONLY },
    ],
    data,
  };
}

async function main() {
  console.log("============================================================");
  console.log("INITIALIZING EXCHANGE POOL ON DEVNET");
  console.log("============================================================\n");

  const rpc = createSolanaRpc(DEVNET_RPC);
  const rpcSubscriptions = createSolanaRpcSubscriptions(DEVNET_RPC_WS);
  const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

  // Load admin keypair
  const keypairPath = process.env.ADMIN_KEYPAIR_PATH || "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const admin = await createKeyPairSignerFromBytes(Uint8Array.from(keypairData));

  console.log("Admin:", admin.address);

  // Check balances
  const balance = await rpc.getBalance(admin.address).send();
  console.log("SOL balance:", Number(balance.value) / 1e9, "SOL");

  // Get PDAs
  const [exchangePoolAddress] = await getPDA(EXCHANGE_POOL);
  const [lpMintAddress] = await getPDA(EXCHANGE_LP_MINT);
  const [solVaultAddress] = await getPDA(EXCHANGE_SOL_VAULT);
  const [rngVaultAddress] = await getPDA(EXCHANGE_RNG_VAULT);

  console.log("\n--- PDAs ---");
  console.log("Exchange Pool:", exchangePoolAddress);
  console.log("LP Mint:", lpMintAddress);
  console.log("SOL Vault:", solVaultAddress);
  console.log("RNG Vault:", rngVaultAddress);

  // Check if pool already exists
  const poolInfo = await rpc.getAccountInfo(exchangePoolAddress, { encoding: "base64" }).send();
  if (poolInfo.value) {
    console.log("\nExchange pool already exists!");
    const data = Buffer.from(poolInfo.value.data[0], "base64");
    console.log("Data length:", data.length, "bytes");

    // Parse some pool state
    const solReserve = data.readBigUInt64LE(136);
    const rngReserve = data.readBigUInt64LE(144);
    console.log("SOL Reserve:", Number(solReserve) / 1e9, "SOL");
    console.log("RNG Reserve:", Number(rngReserve) / 1e9, "RNG");
    return;
  }

  // Check admin's RNG balance
  const [adminRngAta] = await findAssociatedTokenPda({
    mint: RNG_MINT,
    owner: admin.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  let rngBalance = 0n;
  try {
    const rngBalanceInfo = await rpc.getTokenAccountBalance(adminRngAta).send();
    rngBalance = BigInt(rngBalanceInfo.value.amount);
    console.log("\nAdmin RNG balance:", Number(rngBalance) / 1e9, "RNG");
  } catch (e) {
    console.log("\nNo RNG token account. Need to mint RNG first.");
  }

  // Initial liquidity amounts
  const ONE_SOL = 1_000_000_000n; // 1 SOL in lamports
  const ONE_TOKEN = 1_000_000_000n; // 1 RNG in base units (9 decimals)

  const initialSol = 10n * ONE_SOL; // 10 SOL
  const initialRng = 1000n * ONE_TOKEN; // 1000 RNG (1 SOL = 100 RNG initial price)

  console.log("\n--- Initial Liquidity ---");
  console.log("SOL:", Number(initialSol) / 1e9, "SOL");
  console.log("RNG:", Number(initialRng) / 1e9, "RNG");
  console.log("Initial price: 1 SOL = 100 RNG (10 SOL pool)");

  // Step 1: Create admin RNG ATA if needed
  const adminRngAtaInfo = await rpc.getAccountInfo(adminRngAta, { encoding: "base64" }).send();
  if (!adminRngAtaInfo.value) {
    console.log("\nCreating admin RNG ATA...");
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    const createAtaIx = getCreateAssociatedTokenIdempotentInstruction({
      payer: admin,
      owner: admin.address,
      mint: RNG_MINT,
      ata: adminRngAta,
    });

    const tx = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(admin, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      (m) => appendTransactionMessageInstruction(createAtaIx, m),
    );

    const signedTx = await signTransactionMessageWithSigners(tx);
    await sendAndConfirmTransaction(signedTx, { commitment: "confirmed" });
    console.log("Created admin RNG ATA!");
  }

  // Step 2: Mint RNG to admin if needed
  if (rngBalance < initialRng) {
    const mintAmount = initialRng * 10n; // Mint 10x what we need
    console.log("\nMinting", Number(mintAmount) / 1e9, "RNG to admin...");

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    const mintIx = getMintToInstruction({
      mint: RNG_MINT,
      token: adminRngAta,
      mintAuthority: admin,
      amount: mintAmount,
    });

    const tx = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(admin, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      (m) => appendTransactionMessageInstruction(mintIx, m),
    );

    try {
      const signedTx = await signTransactionMessageWithSigners(tx);
      await sendAndConfirmTransaction(signedTx, { commitment: "confirmed" });
      console.log("Minted RNG!");
    } catch (e) {
      console.log("Mint error:", e.message?.slice(0, 200));
    }
  }

  // Step 3: Initialize exchange pool
  console.log("\nInitializing exchange pool...");
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const initIx = await createInitializeExchangePoolInstruction(admin, initialSol, initialRng);

  const tx = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(admin, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstruction(initIx, m),
  );

  try {
    const signedTx = await signTransactionMessageWithSigners(tx);
    const sig = getSignatureFromTransaction(signedTx);
    await sendAndConfirmTransaction(signedTx, { commitment: "confirmed" });
    console.log("SUCCESS! Signature:", sig.slice(0, 30) + "...");

    // Verify pool creation
    const poolAfter = await rpc.getAccountInfo(exchangePoolAddress, { encoding: "base64" }).send();
    if (poolAfter.value) {
      console.log("\nExchange pool created successfully!");
      console.log("Data length:", Buffer.from(poolAfter.value.data[0], "base64").length, "bytes");
    }
  } catch (e) {
    console.log("ERROR:", e.message?.slice(0, 500));
    if (e.logs) {
      console.log("\nLogs:");
      e.logs.slice(-10).forEach(log => console.log("  ", log));
    }
  }

  console.log("\n============================================================");
  console.log("DONE");
  console.log("============================================================");
}

main().catch(console.error);
