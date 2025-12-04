#!/usr/bin/env node
/**
 * Test Exchange Pool Swaps on Devnet
 *
 * Tests:
 * 1. Swap SOL for RNG (SwapSolToRng = 79)
 * 2. Swap RNG for SOL (SwapRngToSol = 80)
 * 3. Verify protocol fees accumulate
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
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
} from "@solana-program/token";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import fs from "fs";

// Devnet configuration
const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const DEVNET_RPC_WS = "wss://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const ORE_PROGRAM_ID = address("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");

// Token mints
const RNG_MINT = address("8HJyJPD4iWD1X9FxZEjDuVpPqSBvNeaJCczXeK2xsShs");
const SOL_MINT = address("So11111111111111111111111111111111111111112");

// PDA seeds
const EXCHANGE_POOL = "exchange_pool";
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
 * Create SwapSolToRng instruction
 *
 * Account layout (from swap_sol_rng.rs):
 * 0: user (signer)
 * 1: exchange_pool (PDA, writable)
 * 2: sol_vault (PDA, writable)
 * 3: rng_vault (PDA, writable)
 * 4: user_rng_ata (writable) - user's RNG destination
 * 5: rng_mint - RNG token mint
 * 6: sol_mint - wrapped SOL mint
 * 7: system_program
 * 8: token_program
 */
async function createSwapSolToRngInstruction(user, solAmount, minRngOut) {
  const [exchangePoolAddress] = await getPDA(EXCHANGE_POOL);
  const [solVaultAddress] = await getPDA(EXCHANGE_SOL_VAULT);
  const [rngVaultAddress] = await getPDA(EXCHANGE_RNG_VAULT);

  const [userRngAta] = await findAssociatedTokenPda({
    mint: RNG_MINT,
    owner: user.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  // Instruction data: discriminator(1) + sol_amount(8) + min_rng_out(8)
  const data = new Uint8Array(17);
  data[0] = 79; // SwapSolToRng discriminator
  data.set(toLeBytes(BigInt(solAmount), 8), 1);
  data.set(toLeBytes(BigInt(minRngOut), 8), 9);

  return {
    programAddress: ORE_PROGRAM_ID,
    accounts: [
      { address: user.address, role: AccountRole.WRITABLE_SIGNER, signer: user },
      { address: exchangePoolAddress, role: AccountRole.WRITABLE },
      { address: solVaultAddress, role: AccountRole.WRITABLE },
      { address: rngVaultAddress, role: AccountRole.WRITABLE },
      { address: userRngAta, role: AccountRole.WRITABLE },
      { address: RNG_MINT, role: AccountRole.READONLY },
      { address: SOL_MINT, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  };
}

/**
 * Create SwapRngToSol instruction
 *
 * Account layout:
 * 0: user (signer)
 * 1: exchange_pool (PDA, writable)
 * 2: sol_vault (PDA, writable)
 * 3: rng_vault (PDA, writable)
 * 4: user_sol_ata (writable) - user's wSOL destination
 * 5: user_rng_ata (writable) - user's RNG source
 * 6: rng_mint - RNG token mint
 * 7: sol_mint - wrapped SOL mint
 * 8: system_program
 * 9: token_program
 */
async function createSwapRngToSolInstruction(user, rngAmount, minSolOut) {
  const [exchangePoolAddress] = await getPDA(EXCHANGE_POOL);
  const [solVaultAddress] = await getPDA(EXCHANGE_SOL_VAULT);
  const [rngVaultAddress] = await getPDA(EXCHANGE_RNG_VAULT);

  const [userSolAta] = await findAssociatedTokenPda({
    mint: SOL_MINT,
    owner: user.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const [userRngAta] = await findAssociatedTokenPda({
    mint: RNG_MINT,
    owner: user.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  // Instruction data: discriminator(1) + rng_amount(8) + min_sol_out(8)
  const data = new Uint8Array(17);
  data[0] = 80; // SwapRngToSol discriminator
  data.set(toLeBytes(BigInt(rngAmount), 8), 1);
  data.set(toLeBytes(BigInt(minSolOut), 8), 9);

  return {
    programAddress: ORE_PROGRAM_ID,
    accounts: [
      { address: user.address, role: AccountRole.WRITABLE_SIGNER, signer: user },
      { address: exchangePoolAddress, role: AccountRole.WRITABLE },
      { address: solVaultAddress, role: AccountRole.WRITABLE },
      { address: rngVaultAddress, role: AccountRole.WRITABLE },
      { address: userSolAta, role: AccountRole.WRITABLE },
      { address: userRngAta, role: AccountRole.WRITABLE },
      { address: RNG_MINT, role: AccountRole.READONLY },
      { address: SOL_MINT, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  };
}

async function getPoolState(rpc) {
  const [exchangePoolAddress] = await getPDA(EXCHANGE_POOL);
  const poolInfo = await rpc.getAccountInfo(exchangePoolAddress, { encoding: "base64" }).send();
  if (!poolInfo.value) return null;

  const data = Buffer.from(poolInfo.value.data[0], "base64");
  return {
    solReserve: data.readBigUInt64LE(136),
    rngReserve: data.readBigUInt64LE(144),
    protocolFeesSol: data.readBigUInt64LE(192),
    protocolFeesRng: data.readBigUInt64LE(200),
    totalSwaps: data.readBigUInt64LE(224),
  };
}

async function main() {
  console.log("============================================================");
  console.log("TESTING EXCHANGE POOL SWAPS ON DEVNET");
  console.log("============================================================\n");

  const rpc = createSolanaRpc(DEVNET_RPC);
  const rpcSubscriptions = createSolanaRpcSubscriptions(DEVNET_RPC_WS);
  const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

  // Load user keypair
  const keypairPath = process.env.USER_KEYPAIR_PATH || "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const user = await createKeyPairSignerFromBytes(Uint8Array.from(keypairData));

  console.log("User:", user.address);

  // Get initial pool state
  const stateBefore = await getPoolState(rpc);
  console.log("\n--- Pool State Before ---");
  console.log("SOL Reserve:", Number(stateBefore.solReserve) / 1e9, "SOL");
  console.log("RNG Reserve:", Number(stateBefore.rngReserve) / 1e9, "RNG");
  console.log("Protocol Fees SOL:", Number(stateBefore.protocolFeesSol) / 1e9);
  console.log("Protocol Fees RNG:", Number(stateBefore.protocolFeesRng) / 1e9);
  console.log("Total Swaps:", stateBefore.totalSwaps.toString());

  // Ensure user has RNG ATA
  const [userRngAta] = await findAssociatedTokenPda({
    mint: RNG_MINT,
    owner: user.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  const userRngAtaInfo = await rpc.getAccountInfo(userRngAta, { encoding: "base64" }).send();
  if (!userRngAtaInfo.value) {
    console.log("\nCreating user RNG ATA...");
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    const createAtaIx = getCreateAssociatedTokenIdempotentInstruction({
      payer: user,
      owner: user.address,
      mint: RNG_MINT,
      ata: userRngAta,
    });
    const tx = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(user, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      (m) => appendTransactionMessageInstruction(createAtaIx, m),
    );
    const signedTx = await signTransactionMessageWithSigners(tx);
    await sendAndConfirmTransaction(signedTx, { commitment: "confirmed" });
    console.log("Created!");
  }

  // Test 1: Swap SOL for RNG
  console.log("\n--- Test 1: Swap SOL -> RNG ---");
  const solSwapAmount = 100_000_000n; // 0.1 SOL
  const minRngOut = 1n; // Very low slippage protection for testing

  // Calculate expected output (CPMM formula)
  const expectedRng = (solSwapAmount * stateBefore.rngReserve * 99n) /
                      (stateBefore.solReserve * 100n + solSwapAmount * 99n);
  console.log("Swapping:", Number(solSwapAmount) / 1e9, "SOL");
  console.log("Expected RNG out (approx):", Number(expectedRng) / 1e9, "RNG");

  try {
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    const swapIx = await createSwapSolToRngInstruction(user, solSwapAmount, minRngOut);

    const tx = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(user, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      (m) => appendTransactionMessageInstruction(swapIx, m),
    );

    const signedTx = await signTransactionMessageWithSigners(tx);
    const sig = getSignatureFromTransaction(signedTx);
    await sendAndConfirmTransaction(signedTx, { commitment: "confirmed" });
    console.log("SUCCESS! Sig:", sig.slice(0, 30) + "...");
  } catch (e) {
    console.log("ERROR:", e.message?.slice(0, 300));
    if (e.logs) e.logs.slice(-5).forEach(log => console.log("  ", log));
  }

  // Get pool state after first swap
  const stateAfterSwap1 = await getPoolState(rpc);
  console.log("\n--- Pool State After Swap 1 ---");
  console.log("SOL Reserve:", Number(stateAfterSwap1.solReserve) / 1e9, "SOL");
  console.log("RNG Reserve:", Number(stateAfterSwap1.rngReserve) / 1e9, "RNG");
  console.log("Protocol Fees SOL:", Number(stateAfterSwap1.protocolFeesSol) / 1e9);
  console.log("Protocol Fees RNG:", Number(stateAfterSwap1.protocolFeesRng) / 1e9);
  console.log("Total Swaps:", stateAfterSwap1.totalSwaps.toString());

  // Test 2: Swap RNG back to SOL
  console.log("\n--- Test 2: Swap RNG -> SOL ---");
  const rngSwapAmount = 5_000_000_000n; // 5 RNG
  const minSolOut = 1n;

  // First need to ensure user has wSOL ATA
  const [userSolAta] = await findAssociatedTokenPda({
    mint: SOL_MINT,
    owner: user.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  const userSolAtaInfo = await rpc.getAccountInfo(userSolAta, { encoding: "base64" }).send();
  if (!userSolAtaInfo.value) {
    console.log("Creating user wSOL ATA...");
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    const createAtaIx = getCreateAssociatedTokenIdempotentInstruction({
      payer: user,
      owner: user.address,
      mint: SOL_MINT,
      ata: userSolAta,
    });
    const tx = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(user, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      (m) => appendTransactionMessageInstruction(createAtaIx, m),
    );
    const signedTx = await signTransactionMessageWithSigners(tx);
    await sendAndConfirmTransaction(signedTx, { commitment: "confirmed" });
    console.log("Created!");
  }

  console.log("Swapping:", Number(rngSwapAmount) / 1e9, "RNG");

  try {
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    const swapIx = await createSwapRngToSolInstruction(user, rngSwapAmount, minSolOut);

    const tx = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(user, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      (m) => appendTransactionMessageInstruction(swapIx, m),
    );

    const signedTx = await signTransactionMessageWithSigners(tx);
    const sig = getSignatureFromTransaction(signedTx);
    await sendAndConfirmTransaction(signedTx, { commitment: "confirmed" });
    console.log("SUCCESS! Sig:", sig.slice(0, 30) + "...");
  } catch (e) {
    console.log("ERROR:", e.message?.slice(0, 300));
    if (e.logs) e.logs.slice(-5).forEach(log => console.log("  ", log));
  }

  // Get final pool state
  const stateAfter = await getPoolState(rpc);
  console.log("\n--- Pool State After All Swaps ---");
  console.log("SOL Reserve:", Number(stateAfter.solReserve) / 1e9, "SOL");
  console.log("RNG Reserve:", Number(stateAfter.rngReserve) / 1e9, "RNG");
  console.log("Protocol Fees SOL:", Number(stateAfter.protocolFeesSol) / 1e9);
  console.log("Protocol Fees RNG:", Number(stateAfter.protocolFeesRng) / 1e9);
  console.log("Total Swaps:", stateAfter.totalSwaps.toString());

  // Calculate new price
  const newPrice = Number(stateAfter.rngReserve) / Number(stateAfter.solReserve);
  console.log("\n--- Price ---");
  console.log("1 SOL =", newPrice.toFixed(4), "RNG");

  // Summary
  console.log("\n============================================================");
  console.log("SUMMARY");
  console.log("============================================================");
  console.log("Swaps executed:", Number(stateAfter.totalSwaps) - Number(stateBefore.totalSwaps));
  console.log("Protocol fees generated:");
  console.log("  SOL:", Number(stateAfter.protocolFeesSol - stateBefore.protocolFeesSol) / 1e9);
  console.log("  RNG:", Number(stateAfter.protocolFeesRng - stateBefore.protocolFeesRng) / 1e9);
}

main().catch(console.error);
