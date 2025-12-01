#!/usr/bin/env node
/**
 * Fund Craps House on Devnet
 *
 * This script:
 * 1. Creates admin's CRAP token ATA if needed
 * 2. Mints CRAP tokens to admin (admin must be mint authority)
 * 3. Calls FundCrapsHouse to fund the house bankroll
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
  getMintToInstruction,
  getCreateAssociatedTokenIdempotentInstruction,
} from "@solana-program/token";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import fs from "fs";

// Devnet configuration
const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const DEVNET_RPC_WS = "wss://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const ORE_PROGRAM_ID = address("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
// Devnet CRAP mint (created via spl-token create-token)
const CRAP_MINT = address("7frAenkamJSASBH9YukkzBsSMz9paQdYuSGw4SjWkXrf");

async function crapsGamePDA() {
  return getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode("craps_game")],
  });
}

async function crapsVaultPDA() {
  return getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode("craps_vault")],
  });
}

function toLeBytes(n, len) {
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = Number((n >> BigInt(8 * i)) & 0xffn);
  }
  return arr;
}

// Create FundCrapsHouse instruction with all 9 required accounts
function createFundCrapsHouseInstruction(
  signer,
  crapsGameAddress,
  crapsVaultAddress,
  signerCrapAta,
  vaultCrapAta,
  crapMint,
  amount
) {
  const data = new Uint8Array(9);
  data[0] = 26; // FundCrapsHouse discriminator
  data.set(toLeBytes(BigInt(amount), 8), 1);

  return {
    programAddress: ORE_PROGRAM_ID,
    accounts: [
      { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
      { address: crapsGameAddress, role: AccountRole.WRITABLE },
      { address: crapsVaultAddress, role: AccountRole.READONLY },
      { address: signerCrapAta, role: AccountRole.WRITABLE },
      { address: vaultCrapAta, role: AccountRole.WRITABLE },
      { address: crapMint, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: ASSOCIATED_TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  };
}

async function main() {
  console.log("============================================================");
  console.log("FUNDING CRAPS HOUSE ON DEVNET");
  console.log("============================================================");
  console.log("RPC:", DEVNET_RPC.replace(/api-key=.*/, "api-key=***"));
  console.log("CRAP Mint:", CRAP_MINT.toString());

  const rpc = createSolanaRpc(DEVNET_RPC);
  const rpcSubscriptions = createSolanaRpcSubscriptions(DEVNET_RPC_WS);
  const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

  // Load admin keypair
  const keypairPath = process.env.ADMIN_KEYPAIR_PATH || "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const admin = await createKeyPairSignerFromBytes(Uint8Array.from(keypairData));

  const [crapsGameAddress] = await crapsGamePDA();
  const [crapsVaultAddress] = await crapsVaultPDA();

  // Get ATAs using findAssociatedTokenPda
  const [signerCrapAta] = await findAssociatedTokenPda({
    mint: CRAP_MINT,
    owner: admin.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const [vaultCrapAta] = await findAssociatedTokenPda({
    mint: CRAP_MINT,
    owner: crapsVaultAddress,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  console.log("\nAdmin:", admin.address);
  console.log("CrapsGame PDA:", crapsGameAddress);
  console.log("CrapsVault PDA:", crapsVaultAddress);
  console.log("Admin CRAP ATA:", signerCrapAta);
  console.log("Vault CRAP ATA:", vaultCrapAta);

  // Check admin SOL balance
  const balance = await rpc.getBalance(admin.address).send();
  console.log("\nAdmin SOL balance:", Number(balance.value) / 1e9, "SOL");

  if (balance.value < 100000000n) {
    console.log("WARNING: Low SOL balance. You may need more SOL for transactions.");
  }

  // Step 1: Create admin's CRAP ATA if needed
  const adminAtaInfo = await rpc.getAccountInfo(signerCrapAta, { encoding: "base64" }).send();
  if (!adminAtaInfo.value) {
    console.log("\nCreating admin CRAP ATA...");
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    const createAtaIx = getCreateAssociatedTokenIdempotentInstruction({
      payer: admin,
      owner: admin.address,
      mint: CRAP_MINT,
      ata: signerCrapAta,
    });

    const tx = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(admin, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      (m) => appendTransactionMessageInstruction(createAtaIx, m),
    );

    const signedTx = await signTransactionMessageWithSigners(tx);
    const sig = getSignatureFromTransaction(signedTx);
    await sendAndConfirmTransaction(signedTx, { commitment: "confirmed" });
    console.log("  Created admin ATA! Sig:", sig.slice(0, 20) + "...");
  } else {
    console.log("\nAdmin CRAP ATA already exists");
  }

  // Step 2: Mint CRAP tokens to admin (admin should be mint authority on devnet)
  const ONE_CRAP = 1_000_000_000n; // 9 decimals
  const mintAmount = 1_000_000n * ONE_CRAP; // 1 million CRAP

  console.log("\nMinting 1,000,000 CRAP tokens to admin...");
  const { value: latestBlockhash1 } = await rpc.getLatestBlockhash().send();

  const mintIx = getMintToInstruction({
    mint: CRAP_MINT,
    token: signerCrapAta,
    mintAuthority: admin,
    amount: mintAmount,
  });

  const mintTx = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(admin, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash1, m),
    (m) => appendTransactionMessageInstruction(mintIx, m),
  );

  try {
    const signedMintTx = await signTransactionMessageWithSigners(mintTx);
    const mintSig = getSignatureFromTransaction(signedMintTx);
    await sendAndConfirmTransaction(signedMintTx, { commitment: "confirmed" });
    console.log("  Minted! Sig:", mintSig.slice(0, 20) + "...");
  } catch (e) {
    console.log("  Mint error (may already have tokens or not authority):", e.message?.slice(0, 100));
  }

  // Check admin CRAP balance
  try {
    const adminBalance = await rpc.getTokenAccountBalance(signerCrapAta).send();
    console.log("  Admin CRAP balance:", adminBalance.value.uiAmount, "CRAP");
  } catch (e) {
    console.log("  Could not fetch admin CRAP balance:", e.message?.slice(0, 50));
  }

  // Step 3: Check if CrapsGame exists
  const crapsGameAccount = await rpc.getAccountInfo(crapsGameAddress, { encoding: "base64" }).send();
  if (!crapsGameAccount.value) {
    console.log("\nCrapsGame account does not exist. Will be created by FundCrapsHouse.");
  } else {
    console.log("\nCrapsGame account exists, data length:", crapsGameAccount.value.data[0].length);
  }

  // Step 4: Fund the house with 100,000 CRAP tokens
  const fundAmount = 100_000n * ONE_CRAP;
  console.log("\nFunding craps house with 100,000 CRAP tokens...");

  const { value: latestBlockhash2 } = await rpc.getLatestBlockhash().send();

  const fundIx = createFundCrapsHouseInstruction(
    admin,
    crapsGameAddress,
    crapsVaultAddress,
    signerCrapAta,
    vaultCrapAta,
    CRAP_MINT,
    fundAmount
  );

  const fundTx = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(admin, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash2, m),
    (m) => appendTransactionMessageInstruction(fundIx, m),
  );

  try {
    const signedFundTx = await signTransactionMessageWithSigners(fundTx);
    const sig = getSignatureFromTransaction(signedFundTx);
    await sendAndConfirmTransaction(signedFundTx, { commitment: "confirmed" });
    console.log("  Funded house! Sig:", sig.slice(0, 20) + "...");
  } catch (e) {
    console.log("  Error:", e.message?.slice(0, 300) || e.toString());
    if (e.logs) {
      console.log("  Logs:", e.logs.slice(-5).join("\n       "));
    }
  }

  // Step 5: Verify accounts after funding
  const crapsGameAfter = await rpc.getAccountInfo(crapsGameAddress, { encoding: "base64" }).send();
  if (crapsGameAfter.value) {
    console.log("\nCrapsGame account created!");
    console.log("  Owner:", crapsGameAfter.value.owner);
    console.log("  Data length:", Buffer.from(crapsGameAfter.value.data[0], "base64").length, "bytes");
    console.log("  Lamports:", crapsGameAfter.value.lamports);

    // Parse house_bankroll from account data
    const data = Buffer.from(crapsGameAfter.value.data[0], "base64");
    if (data.length >= 35) {
      const houseBankroll = Number(data.readBigUInt64LE(19)) / Number(ONE_CRAP);
      console.log("  House bankroll:", houseBankroll.toLocaleString(), "CRAP");
    }
  } else {
    console.log("\nCrapsGame account NOT created!");
  }

  // Check vault token account
  const vaultAtaInfo = await rpc.getAccountInfo(vaultCrapAta, { encoding: "base64" }).send();
  if (vaultAtaInfo.value) {
    const vaultBalance = await rpc.getTokenAccountBalance(vaultCrapAta).send();
    console.log("\nVault CRAP balance:", vaultBalance.value.uiAmount?.toLocaleString(), "CRAP");
  } else {
    console.log("\nVault CRAP ATA not created yet");
  }

  console.log("\n============================================================");
  console.log("DONE");
  console.log("============================================================");
}

main().catch(console.error);
