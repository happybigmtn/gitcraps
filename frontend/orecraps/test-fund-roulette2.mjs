#!/usr/bin/env node
/**
 * Test script to debug FundRouletteHouse instruction
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
  getBase64EncodedWireTransaction,
} from "@solana/kit";
import {
  TOKEN_PROGRAM_ADDRESS,
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
} from "@solana-program/token";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import fs from "fs";

const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const DEVNET_RPC_WS = "wss://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const ORE_PROGRAM_ID = address("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const ROUL_MINT = address("34rCuo8DHHJaJTuEUF8NAXE7h8aBumqDpd48NfgXWVPi");

async function main() {
  const rpc = createSolanaRpc(DEVNET_RPC);
  const rpcSubscriptions = createSolanaRpcSubscriptions(DEVNET_RPC_WS);
  const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
  
  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const admin = await createKeyPairSignerFromBytes(Uint8Array.from(keypairData));
  
  console.log("Admin:", admin.address);
  
  // Get PDAs
  const [gameAddress] = await getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode("roulette_game")],
  });
  const [vaultAddress] = await getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode("roulette_vault")],
  });
  
  console.log("Game PDA:", gameAddress);
  console.log("Vault PDA:", vaultAddress);
  
  // Get ATAs
  const [signerAta] = await findAssociatedTokenPda({
    mint: ROUL_MINT,
    owner: admin.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const [vaultAta] = await findAssociatedTokenPda({
    mint: ROUL_MINT,
    owner: vaultAddress,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  
  console.log("Signer ATA:", signerAta);
  console.log("Vault ATA:", vaultAta);
  
  // Check signer balance
  try {
    const balance = await rpc.getTokenAccountBalance(signerAta).send();
    console.log("Signer token balance:", balance.value.uiAmount);
  } catch (e) {
    console.log("No token balance found");
  }
  
  // Build instruction - use smaller amount for testing
  const amount = 1_000n * 1_000_000_000n; // 1k tokens
  const data = new Uint8Array(9);
  data[0] = 47; // FundRouletteHouse discriminator
  for (let i = 0; i < 8; i++) {
    data[1 + i] = Number((amount >> BigInt(8 * i)) & 0xffn);
  }
  
  const instruction = {
    programAddress: ORE_PROGRAM_ID,
    accounts: [
      { address: admin.address, role: AccountRole.WRITABLE_SIGNER, signer: admin },
      { address: gameAddress, role: AccountRole.WRITABLE },
      { address: vaultAddress, role: AccountRole.READONLY },
      { address: signerAta, role: AccountRole.WRITABLE },
      { address: vaultAta, role: AccountRole.WRITABLE },
      { address: ROUL_MINT, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: ASSOCIATED_TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  };
  
  console.log("\nBuilding transaction...");
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  
  const tx = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(admin, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstruction(instruction, m),
  );
  
  const signedTx = await signTransactionMessageWithSigners(tx);
  const sig = getSignatureFromTransaction(signedTx);
  
  console.log("Signature will be:", sig);
  console.log("\nSending transaction...");
  
  try {
    await sendAndConfirmTransaction(signedTx, { commitment: "confirmed" });
    console.log("SUCCESS!");
  } catch (e) {
    console.log("\nTransaction failed:");
    console.log("Error:", e.message || e.toString());
    if (e.context) {
      console.log("Context:", JSON.stringify(e.context, null, 2));
    }
    if (e.logs) {
      console.log("Logs:", e.logs.join("\n"));
    }
    
    // Try to fetch transaction to get logs
    try {
      await new Promise(r => setTimeout(r, 2000));
      const txInfo = await rpc.getTransaction(sig, { 
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed"
      }).send();
      if (txInfo) {
        console.log("\nTransaction meta:");
        console.log("Logs:", txInfo.meta?.logMessages?.join("\n") || "No logs");
        console.log("Err:", JSON.stringify(txInfo.meta?.err));
      }
    } catch (e2) {
      console.log("Could not fetch transaction:", e2.message);
    }
  }
}

main().catch(console.error);
