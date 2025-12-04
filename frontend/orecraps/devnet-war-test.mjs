#!/usr/bin/env node
/**
 * Casino War Game Test on Devnet
 * 1. Check War game status
 * 2. Fund house if needed
 * 3. Place bet
 * 4. Deal cards
 * 5. Claim winnings
 */
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_SLOT_HASHES_PUBKEY,
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
const WAR_MINT = new PublicKey("HMhL9yb5zZ7v6WmQ79NzYj5ebbeX4TN2NUkcuFFFMusz");

function findPDA(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

async function main() {
  const connection = new Connection(DEVNET_RPC, "confirmed");

  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const signer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log("=".repeat(60));
  console.log("DEVNET CASINO WAR GAME TEST");
  console.log("=".repeat(60));
  console.log("Signer:", signer.publicKey.toBase58());
  console.log("WAR Mint:", WAR_MINT.toBase58());

  // Get PDAs
  const [warGame] = findPDA([Buffer.from("war_game")], ORE_PROGRAM_ID);
  const [warVault] = findPDA([Buffer.from("war_vault")], ORE_PROGRAM_ID);
  const [warPosition] = findPDA(
    [Buffer.from("war_position"), signer.publicKey.toBuffer()],
    ORE_PROGRAM_ID
  );
  const [boardPda] = findPDA([Buffer.from("board")], ORE_PROGRAM_ID);

  console.log("War Game PDA:", warGame.toBase58());
  console.log("War Vault PDA:", warVault.toBase58());
  console.log("Position PDA:", warPosition.toBase58());

  // Get ATAs
  const signerWarAta = await getAssociatedTokenAddress(WAR_MINT, signer.publicKey);
  const vaultWarAta = await getAssociatedTokenAddress(WAR_MINT, warVault, true);

  console.log("Signer WAR ATA:", signerWarAta.toBase58());
  console.log("Vault WAR ATA:", vaultWarAta.toBase58());

  // Check signer WAR balance
  let balance = 0n;
  try {
    const balanceResp = await connection.getTokenAccountBalance(signerWarAta);
    balance = BigInt(balanceResp.value.amount);
    console.log("WAR balance:", balanceResp.value.uiAmount);
  } catch (e) {
    console.log("No WAR balance - checking if we can mint");
  }

  // Check war game state
  const gameAccount = await connection.getAccountInfo(warGame);
  if (!gameAccount) {
    console.log("\nWar game not initialized - will be created on first bet");
  } else {
    const data = gameAccount.data;
    const epochId = data.readBigUInt64LE(8);
    const houseBankroll = data.readBigUInt64LE(16);
    const reservedPayouts = data.readBigUInt64LE(24);
    console.log(`\nWar Game State:`);
    console.log(`  epoch_id: ${epochId}`);
    console.log(`  house_bankroll: ${houseBankroll}`);
    console.log(`  reserved_payouts: ${reservedPayouts}`);
  }

  // Check if we have WAR tokens
  if (balance === 0n) {
    console.log("\n--- MINTING WAR TOKENS ---");

    // Check if we're mint authority
    const mintInfo = await connection.getAccountInfo(WAR_MINT);
    if (!mintInfo) {
      console.log("ERROR: WAR mint doesn't exist on devnet!");
      console.log("Need to create the mint first using spl-token create-token");
      return;
    }

    console.log("WAR mint exists, checking if we're authority...");

    // Parse mint info to check authority
    const mintData = mintInfo.data;
    // Mint account layout: 4 bytes mint authority option + 32 bytes authority + ...
    const mintAuthorityOption = mintData.readUInt32LE(0);
    if (mintAuthorityOption === 1) {
      const mintAuthority = new PublicKey(mintData.slice(4, 36));
      console.log("Mint authority:", mintAuthority.toBase58());

      if (!mintAuthority.equals(signer.publicKey)) {
        console.log("ERROR: We're not the mint authority!");
        console.log("Cannot mint WAR tokens without being authority");
        return;
      }

      // Create ATA if needed
      const ataInfo = await connection.getAccountInfo(signerWarAta);
      if (!ataInfo) {
        console.log("Creating WAR ATA...");
        const createAtaTx = new Transaction().add(
          createAssociatedTokenAccountInstruction(
            signer.publicKey,
            signerWarAta,
            signer.publicKey,
            WAR_MINT
          )
        );
        await sendAndConfirmTransaction(connection, createAtaTx, [signer]);
        console.log("ATA created");
      }

      // Mint tokens
      const mintAmount = BigInt(1_000_000) * BigInt(1_000_000_000); // 1M WAR
      console.log("Minting 1M WAR tokens...");

      const mintIx = new TransactionInstruction({
        programId: TOKEN_PROGRAM_ID,
        keys: [
          { pubkey: WAR_MINT, isSigner: false, isWritable: true },
          { pubkey: signerWarAta, isSigner: false, isWritable: true },
          { pubkey: signer.publicKey, isSigner: true, isWritable: false },
        ],
        data: Buffer.concat([
          Buffer.from([7]), // MintTo instruction
          Buffer.from(new BigUint64Array([mintAmount]).buffer),
        ]),
      });

      const mintTx = new Transaction().add(mintIx);
      const sig = await sendAndConfirmTransaction(connection, mintTx, [signer]);
      console.log("Minted WAR tokens:", sig);

      // Update balance
      const newBalance = await connection.getTokenAccountBalance(signerWarAta);
      balance = BigInt(newBalance.value.amount);
      console.log("New WAR balance:", newBalance.value.uiAmount);
    } else {
      console.log("Mint authority is disabled - cannot mint");
      return;
    }
  }

  // Fund house if bankroll is 0
  const gameAccountNow = await connection.getAccountInfo(warGame);
  let shouldFund = true;
  if (gameAccountNow) {
    const houseBankroll = gameAccountNow.data.readBigUInt64LE(16);
    shouldFund = houseBankroll === 0n;
  }

  if (shouldFund) {
    console.log("\n--- FUNDING WAR HOUSE ---");

    // Create vault ATA if needed
    const vaultAtaInfo = await connection.getAccountInfo(vaultWarAta);
    if (!vaultAtaInfo) {
      console.log("Creating vault WAR ATA...");
      const createVaultAtaTx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          signer.publicKey,
          vaultWarAta,
          warVault,
          WAR_MINT
        )
      );
      await sendAndConfirmTransaction(connection, createVaultAtaTx, [signer]);
      console.log("Vault ATA created");
    }

    const fundAmount = BigInt(100_000) * BigInt(1_000_000_000); // 100k WAR

    const fundData = Buffer.alloc(9);
    fundData[0] = 53; // FundWarHouse
    fundData.writeBigUInt64LE(fundAmount, 1);

    const fundIx = new TransactionInstruction({
      programId: ORE_PROGRAM_ID,
      keys: [
        { pubkey: signer.publicKey, isSigner: true, isWritable: true },
        { pubkey: warGame, isSigner: false, isWritable: true },
        { pubkey: warVault, isSigner: false, isWritable: false },
        { pubkey: signerWarAta, isSigner: false, isWritable: true },
        { pubkey: vaultWarAta, isSigner: false, isWritable: true },
        { pubkey: WAR_MINT, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: fundData,
    });

    const fundTx = new Transaction().add(fundIx);
    fundTx.feePayer = signer.publicKey;

    try {
      console.log("Funding house with 100k WAR...");
      const sig = await sendAndConfirmTransaction(connection, fundTx, [signer], {
        skipPreflight: false,
        commitment: "confirmed"
      });
      console.log("Funded! Sig:", sig);
    } catch (e) {
      console.log("Fund failed:", e.message);
      if (e.logs) e.logs.forEach(log => console.log("  ", log));
      return;
    }
  }

  // Get current round ID
  const boardAccount = await connection.getAccountInfo(boardPda);
  const roundId = boardAccount ? boardAccount.data.readBigUInt64LE(8) : 0n;
  console.log("\nCurrent round ID:", roundId.toString());

  // ========== STEP 1: PLACE BET ==========
  console.log("\n--- STEP 1: PLACE WAR BET ---");

  const anteAmount = BigInt(1) * BigInt(1_000_000_000); // 1 WAR
  const tieBetAmount = 0n; // No tie bet

  const placeBetData = Buffer.alloc(17);
  placeBetData[0] = 48; // PlaceWarBet
  placeBetData.writeBigUInt64LE(anteAmount, 1);
  placeBetData.writeBigUInt64LE(tieBetAmount, 9);

  const placeBetIx = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: warGame, isSigner: false, isWritable: true },
      { pubkey: warPosition, isSigner: false, isWritable: true },
      { pubkey: warVault, isSigner: false, isWritable: false },
      { pubkey: signerWarAta, isSigner: false, isWritable: true },
      { pubkey: vaultWarAta, isSigner: false, isWritable: true },
      { pubkey: WAR_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: placeBetData,
  });

  const placeBetTx = new Transaction().add(placeBetIx);
  placeBetTx.feePayer = signer.publicKey;

  try {
    console.log("Placing ante bet of 1 WAR...");
    const sig = await sendAndConfirmTransaction(connection, placeBetTx, [signer], {
      skipPreflight: false,
      commitment: "confirmed"
    });
    console.log("Bet placed! Sig:", sig);
  } catch (e) {
    console.log("Place bet failed:", e.message);
    if (e.logs) e.logs.forEach(log => console.log("  ", log));
    return;
  }

  // ========== STEP 2: DEAL CARDS ==========
  console.log("\n--- STEP 2: DEAL CARDS ---");

  const dealData = Buffer.alloc(9);
  dealData[0] = 49; // DealWar
  dealData.writeBigUInt64LE(roundId, 1);

  const dealIx = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: warGame, isSigner: false, isWritable: true },
      { pubkey: warPosition, isSigner: false, isWritable: true },
      { pubkey: warVault, isSigner: false, isWritable: false },
      { pubkey: vaultWarAta, isSigner: false, isWritable: true },
      { pubkey: signerWarAta, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_SLOT_HASHES_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: dealData,
  });

  const dealTx = new Transaction().add(dealIx);
  dealTx.feePayer = signer.publicKey;

  try {
    console.log("Dealing cards...");
    const simulation = await connection.simulateTransaction(dealTx, [signer]);

    if (simulation.value.err) {
      console.log("Deal simulation failed:", JSON.stringify(simulation.value.err));
      simulation.value.logs?.forEach(log => console.log("  ", log));
      return;
    }

    console.log("Deal simulation passed:");
    simulation.value.logs?.forEach(log => console.log("  ", log));

    const sig = await sendAndConfirmTransaction(connection, dealTx, [signer], {
      skipPreflight: false,
      commitment: "confirmed"
    });
    console.log("Cards dealt! Sig:", sig);
  } catch (e) {
    console.log("Deal failed:", e.message);
    if (e.logs) e.logs.forEach(log => console.log("  ", log));
    return;
  }

  // Check position state after deal
  const positionAccount = await connection.getAccountInfo(warPosition);
  if (positionAccount) {
    const data = positionAccount.data;
    // WarPosition layout: authority(32) + epoch_id(8) + round_id(8) + state(1) + ...
    const state = data.readUInt8(8 + 32 + 8 + 8);
    const playerCard = data.readUInt8(8 + 32 + 8 + 8 + 1 + 8 + 8 + 8);
    const dealerCard = data.readUInt8(8 + 32 + 8 + 8 + 1 + 8 + 8 + 8 + 1);
    const pendingWinnings = data.readBigUInt64LE(8 + 32 + 8 + 8 + 1 + 8 + 8 + 8 + 1 + 1 + 1 + 1);

    console.log(`Position state: ${state}`);
    console.log(`Player card: ${playerCard} (rank: ${Math.floor(playerCard / 4)})`);
    console.log(`Dealer card: ${dealerCard} (rank: ${Math.floor(dealerCard / 4)})`);
    console.log(`Pending winnings: ${pendingWinnings}`);

    // If state is 3 (settled), we can claim
    if (state === 3 && pendingWinnings > 0n) {
      console.log("\n--- STEP 3: CLAIM WINNINGS ---");

      const claimData = Buffer.alloc(1);
      claimData[0] = 52; // ClaimWarWinnings

      const claimIx = new TransactionInstruction({
        programId: ORE_PROGRAM_ID,
        keys: [
          { pubkey: signer.publicKey, isSigner: true, isWritable: true },
          { pubkey: warGame, isSigner: false, isWritable: true },
          { pubkey: warPosition, isSigner: false, isWritable: true },
          { pubkey: warVault, isSigner: false, isWritable: false },
          { pubkey: vaultWarAta, isSigner: false, isWritable: true },
          { pubkey: signerWarAta, isSigner: false, isWritable: true },
          { pubkey: WAR_MINT, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: claimData,
      });

      const claimTx = new Transaction().add(claimIx);
      claimTx.feePayer = signer.publicKey;

      try {
        console.log("Claiming winnings...");
        const sig = await sendAndConfirmTransaction(connection, claimTx, [signer], {
          skipPreflight: false,
          commitment: "confirmed"
        });
        console.log("Claimed! Sig:", sig);
      } catch (e) {
        console.log("Claim failed:", e.message);
        if (e.logs) e.logs.forEach(log => console.log("  ", log));
      }
    } else if (state === 1) {
      console.log("\n--- TIE DETECTED ---");
      console.log("Cards tied - would need to Go to War or Surrender");
      console.log("(This test doesn't handle tie resolution)");
    }
  }

  // Final balance
  const finalBalance = await connection.getTokenAccountBalance(signerWarAta);
  console.log("\n--- FINAL STATE ---");
  console.log("Final WAR balance:", finalBalance.value.uiAmount);
  console.log("Balance change:", (BigInt(finalBalance.value.amount) - balance).toString());

  console.log("\n" + "=".repeat(60));
  console.log("TEST COMPLETE");
  console.log("=".repeat(60));
}

main().catch(console.error);
