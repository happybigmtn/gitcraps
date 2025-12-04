#!/usr/bin/env node
/**
 * Simple Craps Bet Test - Places a single PassLine bet
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
  createAssociatedTokenAccountInstruction
} from "@solana/spl-token";
import fs from "fs";

const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const CRAP_MINT = new PublicKey("7frAenkamJSASBH9YukkzBsSMz9paQdYuSGw4SjWkXrf");
const ENTROPY_PROGRAM_ID = new PublicKey("3jSkUuYBoJzQPMEzTvkDFXCZUBksPamrVhrnHR9igu2X");

function findPDA(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

async function main() {
  const connection = new Connection(DEVNET_RPC, "confirmed");

  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const signer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log("Signer:", signer.publicKey.toBase58());

  // Get PDAs
  const [crapsGame] = findPDA([Buffer.from("craps_game")], ORE_PROGRAM_ID);
  const [crapsVault] = findPDA([Buffer.from("craps_vault")], ORE_PROGRAM_ID);

  console.log("Craps Game:", crapsGame.toBase58());
  console.log("Craps Vault:", crapsVault.toBase58());

  // Check game state
  const gameAccount = await connection.getAccountInfo(crapsGame);
  if (!gameAccount) {
    console.log("ERROR: Craps game not initialized!");
    return;
  }

  // Parse game state (simplified)
  const data = gameAccount.data;
  const epochId = data.readBigUInt64LE(8);
  const point = data.readUInt8(16);
  const isComeOut = data.readUInt8(17);
  const houseBankroll = data.readBigUInt64LE(24);
  console.log(`Game state: epoch=${epochId}, point=${point}, isComeOut=${isComeOut}, bankroll=${houseBankroll}`);

  // Get ATAs
  const signerCrapAta = await getAssociatedTokenAddress(CRAP_MINT, signer.publicKey);
  const vaultCrapAta = await getAssociatedTokenAddress(CRAP_MINT, crapsVault, true);

  console.log("Signer CRAP ATA:", signerCrapAta.toBase58());
  console.log("Vault CRAP ATA:", vaultCrapAta.toBase58());

  // Check signer balance
  try {
    const balance = await connection.getTokenAccountBalance(signerCrapAta);
    console.log("Signer CRAP balance:", balance.value.uiAmount);
  } catch (e) {
    console.log("No CRAP balance - need tokens first");
    return;
  }

  // Create position PDA - seeds: [CRAPS_POSITION, signer_pubkey]
  const [positionPda] = findPDA(
    [
      Buffer.from("craps_position"),
      signer.publicKey.toBuffer()
    ],
    ORE_PROGRAM_ID
  );

  console.log("Position PDA:", positionPda.toBase58());

  // Build PlaceCrapsBet instruction
  // Instruction data: [discriminator(1), bet_type(1), point(1), amount(8)]
  const betType = 0; // PassLine
  const pointVal = 0; // Not needed for PassLine
  const amount = BigInt(1) * BigInt(1_000_000_000); // 1 CRAP token

  // Struct layout: discriminator(1) + bet_type(1) + point(1) + padding(6) + amount(8) = 17 bytes
  const data2 = Buffer.alloc(17);
  data2[0] = 23; // PlaceCrapsBet discriminator
  data2[1] = betType;
  data2[2] = pointVal;
  // bytes 3-8 are padding (zeros by default)
  data2.writeBigUInt64LE(amount, 9); // amount starts at offset 9

  console.log("\nBuilding PlaceCrapsBet instruction...");
  console.log(`Bet type: ${betType} (PassLine), Point: ${pointVal}, Amount: ${amount}`);

  // Account layout per program/src/craps/place_bet.rs:
  // 0: signer
  // 1: craps_game - game state PDA
  // 2: craps_position - user position PDA
  // 3: craps_vault - vault PDA (owner of vault token account)
  // 4: signer_crap_ata - signer's CRAP token account
  // 5: vault_crap_ata - craps vault's CRAP token account
  // 6: crap_mint - CRAP token mint
  // 7: system_program
  // 8: token_program
  // 9: associated_token_program
  const instruction = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: crapsGame, isSigner: false, isWritable: true },
      { pubkey: positionPda, isSigner: false, isWritable: true },
      { pubkey: crapsVault, isSigner: false, isWritable: false },
      { pubkey: signerCrapAta, isSigner: false, isWritable: true },
      { pubkey: vaultCrapAta, isSigner: false, isWritable: true },
      { pubkey: CRAP_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: data2,
  });

  const tx = new Transaction().add(instruction);
  tx.feePayer = signer.publicKey;

  console.log("\nSimulating transaction...");
  try {
    const simulation = await connection.simulateTransaction(tx, [signer]);

    if (simulation.value.err) {
      console.log("Simulation failed:", JSON.stringify(simulation.value.err));
      simulation.value.logs?.forEach(log => console.log("  ", log));
    } else {
      console.log("Simulation passed!");
      simulation.value.logs?.forEach(log => console.log("  ", log));

      console.log("\nSending transaction...");
      const sig = await sendAndConfirmTransaction(connection, tx, [signer], {
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
