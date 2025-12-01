#!/usr/bin/env node
/**
 * Migrate Round account to new struct size on devnet
 */

import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction } from "@solana/web3.js";
import * as fs from "fs";

const PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const ROUND_SEED = Buffer.from([114, 111, 117, 110, 100]); // "round" in bytes
const CONFIG_SEED = Buffer.from([99, 111, 110, 102, 105, 103]); // "config" in bytes

// MigrateRound instruction discriminator = 27
const MIGRATE_ROUND_IX = 27;

function getConfigPDA() {
    return PublicKey.findProgramAddressSync([CONFIG_SEED], PROGRAM_ID);
}

function getRoundPDA(roundId) {
    const roundIdBuffer = Buffer.alloc(8);
    roundIdBuffer.writeBigUInt64LE(BigInt(roundId));
    return PublicKey.findProgramAddressSync([ROUND_SEED, roundIdBuffer], PROGRAM_ID);
}

async function main() {
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");

    // Load admin keypair
    const keypairPath = process.env.HOME + "/.config/solana/id.json";
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
    const admin = Keypair.fromSecretKey(Uint8Array.from(keypairData));

    console.log("Admin:", admin.publicKey.toBase58());

    const roundId = 0;
    const [roundPDA] = getRoundPDA(roundId);
    const [configPDA] = getConfigPDA();

    console.log("Round PDA:", roundPDA.toBase58());
    console.log("Config PDA:", configPDA.toBase58());

    // Check current round account size
    const roundAccount = await connection.getAccountInfo(roundPDA);
    if (!roundAccount) {
        console.error("Round account not found!");
        return;
    }

    console.log("Current round account size:", roundAccount.data.length, "bytes");
    console.log("Expected size:", 744, "bytes (8 discriminator + 736 struct)");

    if (roundAccount.data.length >= 744) {
        console.log("Account already at correct size, no migration needed");
        return;
    }

    // Build migrate instruction
    const data = Buffer.alloc(1 + 8);
    data.writeUInt8(MIGRATE_ROUND_IX, 0);
    data.writeBigUInt64LE(BigInt(roundId), 1);

    const migrateIx = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
            { pubkey: admin.publicKey, isSigner: true, isWritable: true },
            { pubkey: configPDA, isSigner: false, isWritable: false },
            { pubkey: roundPDA, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
    });

    const tx = new Transaction().add(migrateIx);

    console.log("\nSending migration transaction...");

    try {
        const sig = await sendAndConfirmTransaction(connection, tx, [admin], {
            commitment: "confirmed",
        });
        console.log("Migration successful!");
        console.log("Signature:", sig);

        // Verify the new size
        const updatedAccount = await connection.getAccountInfo(roundPDA);
        console.log("New round account size:", updatedAccount.data.length, "bytes");
    } catch (err) {
        console.error("Migration failed:", err);
        if (err.logs) {
            console.log("\nProgram logs:");
            err.logs.forEach(log => console.log(log));
        }
    }
}

main().catch(console.error);
