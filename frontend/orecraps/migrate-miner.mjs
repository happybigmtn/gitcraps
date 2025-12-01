#!/usr/bin/env node
/**
 * Migrate Miner account to new struct size on devnet
 */

import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction } from "@solana/web3.js";
import * as fs from "fs";

const PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const MINER_SEED = Buffer.from([109, 105, 110, 101, 114]); // "miner" in bytes

// MigrateMiner instruction discriminator = 28
const MIGRATE_MINER_IX = 28;

function getMinerPDA(authority) {
    return PublicKey.findProgramAddressSync([MINER_SEED, authority.toBuffer()], PROGRAM_ID);
}

async function main() {
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");

    // Load admin keypair
    const keypairPath = process.env.HOME + "/.config/solana/id.json";
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
    const signer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

    console.log("Signer:", signer.publicKey.toBase58());

    const [minerPDA] = getMinerPDA(signer.publicKey);
    console.log("Miner PDA:", minerPDA.toBase58());

    // Check current miner account size
    const minerAccount = await connection.getAccountInfo(minerPDA);
    if (!minerAccount) {
        console.error("Miner account not found!");
        return;
    }

    console.log("Current miner account size:", minerAccount.data.length, "bytes");
    console.log("Expected size:", 720, "bytes (8 discriminator + 712 struct)");

    if (minerAccount.data.length >= 720) {
        console.log("Account already at correct size, no migration needed");
        return;
    }

    // Build migrate instruction
    const data = Buffer.alloc(1);
    data.writeUInt8(MIGRATE_MINER_IX, 0);

    const migrateIx = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
            { pubkey: signer.publicKey, isSigner: true, isWritable: true },
            { pubkey: minerPDA, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
    });

    const tx = new Transaction().add(migrateIx);

    console.log("\nSending migration transaction...");

    try {
        const sig = await sendAndConfirmTransaction(connection, tx, [signer], {
            commitment: "confirmed",
        });
        console.log("Migration successful!");
        console.log("Signature:", sig);

        // Verify the new size
        const updatedAccount = await connection.getAccountInfo(minerPDA);
        console.log("New miner account size:", updatedAccount.data.length, "bytes");
    } catch (err) {
        console.error("Migration failed:", err);
        if (err.logs) {
            console.log("\nProgram logs:");
            err.logs.forEach(log => console.log(log));
        }
    }
}

main().catch(console.error);
