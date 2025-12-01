#!/usr/bin/env node
/**
 * Test Deploy instruction on devnet
 */

import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";

const PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const ENTROPY_PROGRAM_ID = new PublicKey("ENTRopP6U1cQJGEbqDhH3Q8v9LW51LfEqvMVqJKjrKGQ");
const RNG_MINT = new PublicKey("8HJyJPD4iWD1X9FxZEjDuVpPqSBvNeaJCczXeK2xsShs");
const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");

const BOARD_SEED = Buffer.from([98, 111, 97, 114, 100]); // "board"
const AUTOMATION_SEED = Buffer.from([97, 117, 116, 111, 109, 97, 116, 105, 111, 110]); // "automation"
const MINER_SEED = Buffer.from([109, 105, 110, 101, 114]); // "miner"
const ROUND_SEED = Buffer.from([114, 111, 117, 110, 100]); // "round"

// Deploy instruction discriminator = 6
const DEPLOY_IX = 6;

function getBoardPDA() {
    return PublicKey.findProgramAddressSync([BOARD_SEED], PROGRAM_ID);
}

function getAutomationPDA(authority) {
    return PublicKey.findProgramAddressSync([AUTOMATION_SEED, authority.toBuffer()], PROGRAM_ID);
}

function getMinerPDA(authority) {
    return PublicKey.findProgramAddressSync([MINER_SEED, authority.toBuffer()], PROGRAM_ID);
}

function getRoundPDA(roundId) {
    const roundIdBuffer = Buffer.alloc(8);
    roundIdBuffer.writeBigUInt64LE(BigInt(roundId));
    return PublicKey.findProgramAddressSync([ROUND_SEED, roundIdBuffer], PROGRAM_ID);
}

function getEntropyVarPDA(board, varId) {
    const varIdBuffer = Buffer.alloc(8);
    varIdBuffer.writeBigUInt64LE(BigInt(varId));
    return PublicKey.findProgramAddressSync(
        [Buffer.from("var"), board.toBuffer(), varIdBuffer],
        ENTROPY_PROGRAM_ID
    );
}

async function main() {
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");

    // Load admin keypair
    const keypairPath = process.env.HOME + "/.config/solana/id.json";
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
    const signer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

    console.log("Signer:", signer.publicKey.toBase58());

    const [boardPDA] = getBoardPDA();
    const [automationPDA] = getAutomationPDA(signer.publicKey);
    const [minerPDA] = getMinerPDA(signer.publicKey);
    const [roundPDA] = getRoundPDA(0);
    const [entropyVarPDA] = getEntropyVarPDA(boardPDA, 0);

    console.log("\nPDAs:");
    console.log("  Board:", boardPDA.toBase58());
    console.log("  Automation:", automationPDA.toBase58());
    console.log("  Miner:", minerPDA.toBase58());
    console.log("  Round:", roundPDA.toBase58());
    console.log("  Entropy Var:", entropyVarPDA.toBase58());

    // Get ATAs
    const signerRngAta = await getAssociatedTokenAddress(RNG_MINT, signer.publicKey);
    const roundRngAta = await getAssociatedTokenAddress(RNG_MINT, roundPDA, true);

    console.log("\nATAs:");
    console.log("  Signer RNG ATA:", signerRngAta.toBase58());
    console.log("  Round RNG ATA:", roundRngAta.toBase58());

    // Check signer balance
    const balance = await connection.getTokenAccountBalance(signerRngAta);
    console.log("\nSigner RNG balance:", balance.value.uiAmount);

    if (balance.value.uiAmount === 0) {
        console.error("No RNG tokens to deploy!");
        return;
    }

    // Build deploy instruction
    // Deploy struct:
    // - amount: [u8; 8]
    // - squares: [u8; 8] (64-bit bitmask)
    // - dice_prediction: u8
    // - _padding: [u8; 7]
    const data = Buffer.alloc(1 + 8 + 8 + 1 + 7);
    data.writeUInt8(DEPLOY_IX, 0);
    data.writeBigUInt64LE(1_000_000_000n, 1); // 1 RNG token (9 decimals)
    data.writeBigUInt64LE(1n, 9); // Square 0 only
    data.writeUInt8(7, 17); // Predict 7 (most likely)

    const deployIx = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
            // Ore accounts (7)
            { pubkey: signer.publicKey, isSigner: true, isWritable: true },
            { pubkey: signer.publicKey, isSigner: false, isWritable: false }, // authority
            { pubkey: automationPDA, isSigner: false, isWritable: true },
            { pubkey: boardPDA, isSigner: false, isWritable: true },
            { pubkey: minerPDA, isSigner: false, isWritable: true },
            { pubkey: roundPDA, isSigner: false, isWritable: true },
            { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
            // Token accounts (4)
            { pubkey: signerRngAta, isSigner: false, isWritable: true },
            { pubkey: roundRngAta, isSigner: false, isWritable: true },
            { pubkey: RNG_MINT, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            // Entropy accounts (2)
            { pubkey: entropyVarPDA, isSigner: false, isWritable: true },
            { pubkey: ENTROPY_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data,
    });

    const tx = new Transaction().add(deployIx);

    console.log("\nSending deploy transaction...");

    try {
        const sig = await sendAndConfirmTransaction(connection, tx, [signer], {
            commitment: "confirmed",
            skipPreflight: true,
        });
        console.log("Deploy successful!");
        console.log("Signature:", sig);

        // Check new balance
        const newBalance = await connection.getTokenAccountBalance(signerRngAta);
        console.log("New RNG balance:", newBalance.value.uiAmount);
    } catch (err) {
        console.error("Deploy failed:", err);
        if (err.logs) {
            console.log("\nProgram logs:");
            err.logs.forEach(log => console.log(log));
        }
    }
}

main().catch(console.error);
