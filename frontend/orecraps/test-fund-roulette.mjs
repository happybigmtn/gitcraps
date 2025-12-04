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
  AccountRole,
} from "@solana/kit";
import {
  TOKEN_PROGRAM_ADDRESS,
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
} from "@solana-program/token";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import fs from "fs";

const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const ORE_PROGRAM_ID = address("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const ROUL_MINT = address("34rCuo8DHHJaJTuEUF8NAXE7h8aBumqDpd48NfgXWVPi");

async function main() {
  const rpc = createSolanaRpc(DEVNET_RPC);
  
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
  
  // Build instruction
  const amount = 100_000n * 1_000_000_000n; // 100k tokens
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
  
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  
  const tx = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(admin, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstruction(instruction, m),
  );
  
  const signedTx = await signTransactionMessageWithSigners(tx);
  
  // Simulate with full logs
  console.log("\nSimulating transaction...");
  const simulation = await rpc.simulateTransaction(signedTx, {
    commitment: "confirmed",
    encoding: "base64",
    sigVerify: false,
    replaceRecentBlockhash: true,
  }).send();
  
  console.log("\nSimulation result:");
  console.log("Err:", JSON.stringify(simulation.value.err));
  console.log("Logs:", simulation.value.logs?.join("\n") || "No logs");
  console.log("Units consumed:", simulation.value.unitsConsumed);
}

main().catch(console.error);
