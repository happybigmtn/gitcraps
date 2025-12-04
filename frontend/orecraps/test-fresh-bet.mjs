#!/usr/bin/env node
/**
 * Test PlaceCrapsBet with fresh keypair (no existing position)
 */
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  transfer
} from "@solana/spl-token";
import fs from "fs";

const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const CRAP_MINT = new PublicKey("7frAenkamJSASBH9YukkzBsSMz9paQdYuSGw4SjWkXrf");

function findPDA(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

async function main() {
  const connection = new Connection(DEVNET_RPC, "confirmed");

  // Generate fresh keypair
  const freshSigner = Keypair.generate();
  console.log("Fresh signer:", freshSigner.publicKey.toBase58());

  // Load admin to fund the fresh signer
  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const admin = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  console.log("Admin:", admin.publicKey.toBase58());

  // Airdrop SOL to fresh signer
  console.log("\nAirdropping 0.05 SOL to fresh signer...");
  const airdropSig = await connection.requestAirdrop(
    freshSigner.publicKey,
    0.05 * 1e9
  );
  await connection.confirmTransaction(airdropSig, "confirmed");
  console.log("Airdrop confirmed");

  // Create ATA for fresh signer
  const freshSignerAta = await getAssociatedTokenAddress(CRAP_MINT, freshSigner.publicKey);
  console.log("Fresh signer ATA:", freshSignerAta.toBase58());

  // Create ATA if needed
  const ataInfo = await connection.getAccountInfo(freshSignerAta);
  if (!ataInfo) {
    console.log("Creating ATA for fresh signer...");
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        admin.publicKey,
        freshSignerAta,
        freshSigner.publicKey,
        CRAP_MINT
      )
    );
    await sendAndConfirmTransaction(connection, tx, [admin]);
    console.log("ATA created");
  }

  // Transfer CRAP tokens to fresh signer
  const adminAta = await getAssociatedTokenAddress(CRAP_MINT, admin.publicKey);
  console.log("Transferring 10 CRAP to fresh signer...");
  const transferTx = new Transaction().add(
    {
      keys: [
        { pubkey: adminAta, isSigner: false, isWritable: true },
        { pubkey: freshSignerAta, isSigner: false, isWritable: true },
        { pubkey: admin.publicKey, isSigner: true, isWritable: false },
      ],
      data: Buffer.concat([
        Buffer.from([3]), // Transfer instruction
        Buffer.from(new BigUint64Array([BigInt(10_000_000_000)]).buffer), // 10 CRAP
      ]),
      programId: TOKEN_PROGRAM_ID,
    }
  );
  await sendAndConfirmTransaction(connection, transferTx, [admin]);
  console.log("Transfer complete");

  // Get PDAs
  const [crapsGame] = findPDA([Buffer.from("craps_game")], ORE_PROGRAM_ID);
  const [crapsVault] = findPDA([Buffer.from("craps_vault")], ORE_PROGRAM_ID);
  const [positionPda] = findPDA(
    [Buffer.from("craps_position"), freshSigner.publicKey.toBuffer()],
    ORE_PROGRAM_ID
  );
  const vaultCrapAta = await getAssociatedTokenAddress(CRAP_MINT, crapsVault, true);

  console.log("\nCraps Game:", crapsGame.toBase58());
  console.log("Craps Vault:", crapsVault.toBase58());
  console.log("Position PDA:", positionPda.toBase58());
  console.log("Vault ATA:", vaultCrapAta.toBase58());

  // Check if position exists (should NOT exist for fresh signer)
  const positionInfo = await connection.getAccountInfo(positionPda);
  console.log("Position exists:", !!positionInfo);

  // Build PlaceCrapsBet instruction
  const betType = 0; // PassLine
  const pointVal = 0;
  const amount = BigInt(1) * BigInt(1_000_000_000); // 1 CRAP

  const data = Buffer.alloc(17);
  data[0] = 23; // PlaceCrapsBet discriminator
  data[1] = betType;
  data[2] = pointVal;
  data.writeBigUInt64LE(amount, 9);

  console.log("\nBuilding PlaceCrapsBet instruction...");
  console.log(`Bet type: ${betType} (PassLine), Amount: ${amount}`);

  const instruction = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: freshSigner.publicKey, isSigner: true, isWritable: true },
      { pubkey: crapsGame, isSigner: false, isWritable: true },
      { pubkey: positionPda, isSigner: false, isWritable: true },
      { pubkey: crapsVault, isSigner: false, isWritable: false },
      { pubkey: freshSignerAta, isSigner: false, isWritable: true },
      { pubkey: vaultCrapAta, isSigner: false, isWritable: true },
      { pubkey: CRAP_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(instruction);
  tx.feePayer = freshSigner.publicKey;

  console.log("\nSimulating transaction...");
  try {
    const simulation = await connection.simulateTransaction(tx, [freshSigner]);

    if (simulation.value.err) {
      console.log("Simulation failed:", JSON.stringify(simulation.value.err));
      simulation.value.logs?.forEach(log => console.log("  ", log));
    } else {
      console.log("Simulation passed!");
      simulation.value.logs?.forEach(log => console.log("  ", log));

      console.log("\nSending transaction...");
      const sig = await sendAndConfirmTransaction(connection, tx, [freshSigner], {
        skipPreflight: false,
        commitment: "confirmed"
      });
      console.log("SUCCESS! Signature:", sig);
    }
  } catch (e) {
    console.log("Error:", e.message);
    if (e.logs) {
      e.logs.forEach(log => console.log("  ", log));
    }
  }
}

main().catch(console.error);
