#!/usr/bin/env node
/**
 * Test devnet SettleCraps to check if program was compiled with localnet feature
 */

import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import * as fs from "fs";

const PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const SETTLE_CRAPS_IX = 24;

function boardPDA() {
    return PublicKey.findProgramAddressSync([Buffer.from("board")], PROGRAM_ID);
}

function roundPDA(roundId) {
    const idBytes = Buffer.alloc(8);
    idBytes.writeBigUInt64LE(roundId);
    return PublicKey.findProgramAddressSync([Buffer.from("round"), idBytes], PROGRAM_ID);
}

function crapsGamePDA() {
    return PublicKey.findProgramAddressSync([Buffer.from("craps_game")], PROGRAM_ID);
}

function crapsPositionPDA(authority) {
    return PublicKey.findProgramAddressSync([Buffer.from("craps_position"), authority.toBuffer()], PROGRAM_ID);
}

async function main() {
    console.log("=== DEVNET SETTLE CRAPS TEST ===\n");

    const connection = new Connection("https://api.devnet.solana.com", "confirmed");

    // Load admin keypair
    const keypairPath = process.env.HOME + "/.config/solana/id.json";
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
    const signer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

    console.log("Signer:", signer.publicKey.toBase58());

    // Get board info
    const [boardAddress] = boardPDA();
    const boardAccount = await connection.getAccountInfo(boardAddress);

    if (!boardAccount) {
        console.error("Board not found!");
        return;
    }

    const roundId = boardAccount.data.readBigUInt64LE(8);
    console.log("Current round ID:", roundId.toString());

    // Get round info
    const [roundAddress] = roundPDA(roundId);
    const roundAccount = await connection.getAccountInfo(roundAddress);

    if (!roundAccount) {
        console.error("Round not found!");
        return;
    }

    // Check slot_hash
    const slotHashOffset = 8 + 8 + 36 * 8; // discriminator + id + deployed
    const slotHash = roundAccount.data.subarray(slotHashOffset, slotHashOffset + 32);
    const isSlotHashSet = !slotHash.every(b => b === 0);

    console.log("Round slot_hash set:", isSlotHashSet);
    console.log("Slot hash (first 8 bytes):", slotHash.subarray(0, 8).toString("hex"));

    // Get craps accounts
    const [crapsGameAddress] = crapsGamePDA();
    const [crapsPositionAddress] = crapsPositionPDA(signer.publicKey);

    console.log("\nPDAs:");
    console.log("  Board:", boardAddress.toBase58());
    console.log("  Round:", roundAddress.toBase58());
    console.log("  Craps Game:", crapsGameAddress.toBase58());
    console.log("  Craps Position:", crapsPositionAddress.toBase58());

    // Check if craps position exists
    const positionAccount = await connection.getAccountInfo(crapsPositionAddress);
    if (!positionAccount) {
        console.log("\nNo craps position found for signer. Need a different wallet.");
        return;
    }

    // Try settling with winning square 0
    console.log("\n--- Attempting SettleCraps ---");
    console.log("Testing with winning_square = 0...");

    const data = Buffer.alloc(9);
    data[0] = SETTLE_CRAPS_IX;
    data.writeBigUInt64LE(0n, 1); // winning_square = 0

    const instruction = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
            { pubkey: signer.publicKey, isSigner: true, isWritable: true },
            { pubkey: crapsGameAddress, isSigner: false, isWritable: true },
            { pubkey: crapsPositionAddress, isSigner: false, isWritable: true },
            { pubkey: roundAddress, isSigner: false, isWritable: false },
        ],
        data,
    });

    const tx = new Transaction().add(instruction);

    try {
        const sig = await sendAndConfirmTransaction(connection, tx, [signer], {
            commitment: "confirmed",
        });
        console.log("SUCCESS! Signature:", sig);
        console.log("\nProgram appears to be compiled with 'localnet' feature!");
    } catch (err) {
        console.error("\nTransaction failed:", err.message);
        if (err.logs) {
            console.log("\nProgram logs:");
            err.logs.forEach(log => console.log(log));
        }

        if (err.message.includes("Round has no valid RNG")) {
            console.log("\n=> Program NOT compiled with 'localnet' feature.");
            console.log("=> Need to either:");
            console.log("   1. Redeploy program with 'localnet' feature enabled");
            console.log("   2. Deploy entropy program to devnet");
            console.log("   3. Add admin instruction to set round slot_hash");
        }
    }
}

main().catch(console.error);
