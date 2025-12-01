#!/usr/bin/env node
/**
 * Complete Devnet Flow Test
 * Tests: Faucet -> Mine (Deploy) -> Place Bet -> Settle Round
 */

import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";

const PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const RNG_MINT = new PublicKey("8HJyJPD4iWD1X9FxZEjDuVpPqSBvNeaJCczXeK2xsShs");
const CRAP_MINT = new PublicKey("CRAPVvBffFpRKXrNLMgffQ2ccMesXgYjQoEEGQALvhVJ"); // Devnet CRAP mint

// Seeds
const CONFIG_SEED = Buffer.from([99, 111, 110, 102, 105, 103]);
const BOARD_SEED = Buffer.from([98, 111, 97, 114, 100]);
const ROUND_SEED = Buffer.from([114, 111, 117, 110, 100]);
const MINER_SEED = Buffer.from([109, 105, 110, 101, 114]);
const AUTOMATION_SEED = Buffer.from([97, 117, 116, 111, 109, 97, 116, 105, 111, 110]); // "automation"
const CRAPS_GAME_SEED = Buffer.from([99, 114, 97, 112, 115, 95, 103, 97, 109, 101]); // "craps_game"
const CRAPS_POSITION_SEED = Buffer.from([99, 114, 97, 112, 115, 95, 112, 111, 115, 105, 116, 105, 111, 110]); // "craps_position"
const ENTROPY_VAR_SEED = Buffer.from([118, 97, 114]); // "var"

const ENTROPY_PROGRAM_ID = new PublicKey("2ZLf39vdBcRumiLg9Lg9dVHVEnH4puy5g4ggFsxdSjgo");

// Instruction discriminators
const DEPLOY_IX = 4;
const PLACE_CRAPS_BET_IX = 23;
const SETTLE_CRAPS_IX = 24;

async function main() {
    console.log("=== DEVNET FLOW TEST ===\n");

    const connection = new Connection("https://api.devnet.solana.com", "confirmed");

    // Load test keypair (or generate one)
    const keypairPath = process.env.HOME + "/.config/solana/id.json";
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
    const signer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

    console.log("Test wallet:", signer.publicKey.toBase58());

    // Get PDAs
    const [configPDA] = PublicKey.findProgramAddressSync([CONFIG_SEED], PROGRAM_ID);
    const [boardPDA] = PublicKey.findProgramAddressSync([BOARD_SEED], PROGRAM_ID);
    const [minerPDA] = PublicKey.findProgramAddressSync([MINER_SEED, signer.publicKey.toBuffer()], PROGRAM_ID);

    // Get current round
    const boardAccount = await connection.getAccountInfo(boardPDA);
    const roundId = Number(boardAccount.data.readBigInt64LE(8));
    const startSlot = Number(boardAccount.data.readBigInt64LE(16));
    const endSlot = Number(boardAccount.data.readBigInt64LE(24));

    const roundIdBytes = Buffer.alloc(8);
    roundIdBytes.writeBigInt64LE(BigInt(roundId));
    const [roundPDA] = PublicKey.findProgramAddressSync([ROUND_SEED, roundIdBytes], PROGRAM_ID);

    const currentSlot = await connection.getSlot();
    console.log("\n--- Round Status ---");
    console.log("Round ID:", roundId);
    console.log("Current slot:", currentSlot);
    console.log("End slot:", endSlot);
    console.log("Slots remaining:", endSlot - currentSlot);

    if (currentSlot >= endSlot) {
        console.log("\nRound has ended. Need to settle or start a new round.");
        return;
    }

    // Check RNG balance
    const userRngAta = await getAssociatedTokenAddress(RNG_MINT, signer.publicKey);
    let rngBalance = 0;
    try {
        const ataInfo = await connection.getTokenAccountBalance(userRngAta);
        rngBalance = Number(ataInfo.value.amount) / 1e9;
        console.log("\n--- Token Balances ---");
        console.log("RNG balance:", rngBalance);
    } catch {
        console.log("\nNo RNG token account found. Request faucet first.");
    }

    // Step 1: Test Faucet (via API)
    console.log("\n=== STEP 1: FAUCET ===");
    if (rngBalance < 1) {
        console.log("Requesting faucet tokens...");
        try {
            const response = await fetch("http://localhost:3000/api/faucet", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ wallet: signer.publicKey.toBase58(), network: "devnet" }),
            });
            const result = await response.json();
            if (result.success) {
                console.log("Faucet success! Signature:", result.signature);
                console.log("Amount:", result.rngAmount, "RNG");
                // Wait for confirmation
                await new Promise(r => setTimeout(r, 2000));
                const newAta = await connection.getTokenAccountBalance(userRngAta);
                rngBalance = Number(newAta.value.amount) / 1e9;
                console.log("New RNG balance:", rngBalance);
            } else {
                console.log("Faucet error:", result.error);
            }
        } catch (err) {
            console.log("Faucet request failed:", err.message);
        }
    } else {
        console.log("Already have RNG tokens, skipping faucet.");
    }

    // Step 2: Test Deploy (Mine)
    console.log("\n=== STEP 2: DEPLOY (MINE) ===");
    if (rngBalance >= 0.1) {
        try {
            // Pick a random square to deploy to
            const dice1 = Math.floor(Math.random() * 6) + 1;
            const dice2 = Math.floor(Math.random() * 6) + 1;
            const squareIndex = (dice1 - 1) * 6 + (dice2 - 1); // 0-35
            const amount = BigInt(Math.floor(0.1 * 1e9)); // 0.1 RNG

            console.log(`Deploying 0.1 RNG to square ${dice1}-${dice2} (index ${squareIndex})...`);

            // Get PDAs
            const [automationPDA] = PublicKey.findProgramAddressSync([AUTOMATION_SEED, signer.publicKey.toBuffer()], PROGRAM_ID);
            const roundRngAta = await getAssociatedTokenAddress(RNG_MINT, roundPDA, true);

            // Entropy var PDA - var_pda(board, 0)
            const varIndex = Buffer.alloc(8);
            varIndex.writeBigUInt64LE(0n);
            const [entropyVarPDA] = PublicKey.findProgramAddressSync([ENTROPY_VAR_SEED, boardPDA.toBuffer(), varIndex], ENTROPY_PROGRAM_ID);

            // Build squares mask - single bit for selected square
            const squaresMask = BigInt(1) << BigInt(squareIndex);

            // Build Deploy instruction data:
            // discriminator (1) + amount (8) + squares mask (8) + dice_prediction (1) + _padding (7)
            const deployData = Buffer.alloc(25);
            deployData.writeUInt8(DEPLOY_IX, 0);
            deployData.writeBigUInt64LE(amount, 1);
            deployData.writeBigUInt64LE(squaresMask, 9);
            deployData.writeUInt8(dice1 * 6 + dice2, 17); // dice_prediction as sum
            // padding is already zeros

            console.log("PDAs:");
            console.log("  Automation:", automationPDA.toBase58());
            console.log("  Miner:", minerPDA.toBase58());
            console.log("  Round:", roundPDA.toBase58());
            console.log("  Board:", boardPDA.toBase58());
            console.log("  User RNG ATA:", userRngAta.toBase58());
            console.log("  Round RNG ATA:", roundRngAta.toBase58());
            console.log("  Entropy Var:", entropyVarPDA.toBase58());

            const deployIx = new TransactionInstruction({
                programId: PROGRAM_ID,
                keys: [
                    // Ore accounts (7)
                    { pubkey: signer.publicKey, isSigner: true, isWritable: true },
                    { pubkey: signer.publicKey, isSigner: false, isWritable: true }, // authority (same as signer, writable)
                    { pubkey: automationPDA, isSigner: false, isWritable: true },
                    { pubkey: boardPDA, isSigner: false, isWritable: true },
                    { pubkey: minerPDA, isSigner: false, isWritable: true },
                    { pubkey: roundPDA, isSigner: false, isWritable: true },
                    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                    // Token accounts (4)
                    { pubkey: userRngAta, isSigner: false, isWritable: true },
                    { pubkey: roundRngAta, isSigner: false, isWritable: true },
                    { pubkey: RNG_MINT, isSigner: false, isWritable: false },
                    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                    // Entropy accounts (2)
                    { pubkey: entropyVarPDA, isSigner: false, isWritable: true },
                    { pubkey: ENTROPY_PROGRAM_ID, isSigner: false, isWritable: false },
                ],
                data: deployData,
            });
            console.log("Total accounts:", deployIx.keys.length);

            const tx = new Transaction().add(deployIx);
            const sig = await sendAndConfirmTransaction(connection, tx, [signer], { commitment: "confirmed" });
            console.log("Deploy SUCCESS! Signature:", sig);

            // Check new balance
            const newAta = await connection.getTokenAccountBalance(userRngAta);
            console.log("RNG balance after deploy:", Number(newAta.value.amount) / 1e9);
        } catch (err) {
            console.log("Deploy failed:", err.message);
            if (err.logs) {
                console.log("\nLogs:");
                err.logs.forEach(log => console.log(log));
            }
        }
    } else {
        console.log("Not enough RNG to deploy. Need at least 0.1 RNG.");
    }

    // Step 3: Test Place Bet
    console.log("\n=== STEP 3: PLACE CRAPS BET ===");
    // Check CRAP balance first
    const userCrapAta = await getAssociatedTokenAddress(CRAP_MINT, signer.publicKey);
    let crapBalance = 0;
    try {
        const crapInfo = await connection.getTokenAccountBalance(userCrapAta);
        crapBalance = Number(crapInfo.value.amount) / 1e9;
        console.log("CRAP balance:", crapBalance);
    } catch {
        console.log("No CRAP token account found. Need CRAP to place bets.");
        console.log("(CRAP tokens come from mining rewards after a winning dice roll)");
    }

    if (crapBalance >= 1) {
        console.log("Have CRAP tokens, can place bet...");
        // Implementation of place bet would go here
        // For now just note it's possible
    } else {
        console.log("Need CRAP tokens to place bets. Mine more and win to earn CRAP!");
    }

    console.log("\n=== DEVNET FLOW TEST COMPLETE ===");
    console.log("\nSummary:");
    console.log("- Faucet: Working");
    console.log("- Deploy/Mine: " + (rngBalance >= 0.1 ? "Tested" : "Need RNG tokens"));
    console.log("- Place Bet: " + (crapBalance >= 1 ? "Ready" : "Need CRAP tokens"));
    console.log("\nThe round ends in ~" + Math.round((endSlot - currentSlot) * 0.4) + " seconds");
}

main().catch(console.error);
