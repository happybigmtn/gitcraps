# Video Poker Additions to program.ts

Add these sections to `/home/r/Coding/ore/frontend/orecraps/src/lib/program.ts` before the RE-EXPORTS section (around line 2916):

## 1. Import VPK_MINT at the top with other mint imports

```typescript
import { VPK_MINT } from "./solana";
```

## 2. Add Video Poker types and constants (insert before RE-EXPORTS section)

```typescript
// ============================================================================
// VIDEO POKER TYPES AND CONSTANTS
// ============================================================================

// Video Poker game states
export const VP_STATE_NONE = 0;
export const VP_STATE_BETTING = 1;
export const VP_STATE_DEALT = 2;
export const VP_STATE_HELD = 3;
export const VP_STATE_SETTLED = 4;

// Video Poker hand rankings (9/6 Jacks or Better)
export const VP_HAND_NOTHING = 0;
export const VP_HAND_JACKS_OR_BETTER = 1;
export const VP_HAND_TWO_PAIR = 2;
export const VP_HAND_THREE_OF_A_KIND = 3;
export const VP_HAND_STRAIGHT = 4;
export const VP_HAND_FLUSH = 5;
export const VP_HAND_FULL_HOUSE = 6;
export const VP_HAND_FOUR_OF_A_KIND = 7;
export const VP_HAND_STRAIGHT_FLUSH = 8;
export const VP_HAND_ROYAL_FLUSH = 9;

// 9/6 Jacks or Better pay table (per coin)
export const VP_PAY_TABLE: Record<number, number> = {
  [VP_HAND_JACKS_OR_BETTER]: 1,
  [VP_HAND_TWO_PAIR]: 2,
  [VP_HAND_THREE_OF_A_KIND]: 3,
  [VP_HAND_STRAIGHT]: 4,
  [VP_HAND_FLUSH]: 6,
  [VP_HAND_FULL_HOUSE]: 9,
  [VP_HAND_FOUR_OF_A_KIND]: 25,
  [VP_HAND_STRAIGHT_FLUSH]: 50,
  [VP_HAND_ROYAL_FLUSH]: 250, // 800 at 5 coins
};

// VP constants
export const VP_MIN_COINS = 1;
export const VP_MAX_COINS = 5;
export const VP_HAND_SIZE = 5;
export const VP_NO_CARD = 255;

// Video Poker game state (matches on-chain VideoPokerGame struct)
export interface VideoPokerGame {
  epochId: bigint;
  houseBankroll: bigint;
  totalWagered: bigint;
  totalPaid: bigint;
  gamesPlayed: bigint;
}

// Video Poker position state (matches on-chain VideoPokerPosition struct)
export interface VideoPokerPosition {
  authority: PublicKey;
  state: number; // VP_STATE_*
  coins: number; // 1-5 coins bet
  betPerCoin: bigint; // Bet amount per coin in VPK base units
  hand: number[]; // 5 cards (0-51)
  held: boolean[]; // 5 booleans for hold flags
  finalHand: number; // VP_HAND_* after draw
  pendingWinnings: bigint;
  totalWagered: bigint;
  totalWon: bigint;
  totalLost: bigint;
  gamesPlayed: bigint;
  bestHand: number; // Best hand achieved
}

// ============================================================================
// VIDEO POKER PDAs AND INSTRUCTIONS
// ============================================================================

// Video Poker Game PDA (singleton)
export function videoPokerGamePDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("video_poker_game")],
    ORE_PROGRAM_ID
  );
}

// Video Poker Position PDA (per user)
export function videoPokerPositionPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("video_poker_position"), authority.toBuffer()],
    ORE_PROGRAM_ID
  );
}

// Video Poker Vault PDA (token account authority)
export function videoPokerVaultPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("video_poker_vault")],
    ORE_PROGRAM_ID
  );
}

/**
 * Build a PlaceVideoPokerBet instruction.
 * Bets are placed using VPK tokens.
 */
export function createPlaceVideoPokerBetInstruction(
  signer: PublicKey,
  coins: number,
  betPerCoin: bigint
): TransactionInstruction {
  const [videoPokerGameAddress] = videoPokerGamePDA();
  const [videoPokerPositionAddress] = videoPokerPositionPDA(signer);
  const [videoPokerVaultAddress] = videoPokerVaultPDA();

  // VPK token accounts
  const signerVpkAta = getAssociatedTokenAddressSync(VPK_MINT, signer);
  const vaultVpkAta = getAssociatedTokenAddressSync(VPK_MINT, videoPokerVaultAddress, true);

  // Build instruction data
  // Format: [discriminator (1)] [coins (1)] [padding (7)] [bet_per_coin (8)]
  const data = new Uint8Array(17);
  data[0] = OreInstruction.PlaceVideoPokerBet;
  data[1] = coins;
  // data[2-8] = padding
  data.set(toLeBytes(betPerCoin, 8), 9);

  return new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: videoPokerGameAddress, isSigner: false, isWritable: true },
      { pubkey: videoPokerPositionAddress, isSigner: false, isWritable: true },
      { pubkey: videoPokerVaultAddress, isSigner: false, isWritable: false },
      { pubkey: signerVpkAta, isSigner: false, isWritable: true },
      { pubkey: vaultVpkAta, isSigner: false, isWritable: true },
      { pubkey: VPK_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

/**
 * Build a DealVideoPoker instruction.
 * Deals initial 5 cards using slot_hash for RNG.
 */
export function createDealVideoPokerInstruction(
  signer: PublicKey,
  slotHash: Uint8Array
): TransactionInstruction {
  const [videoPokerGameAddress] = videoPokerGamePDA();
  const [videoPokerPositionAddress] = videoPokerPositionPDA(signer);

  // Build instruction data
  // Format: [discriminator (1)] [slot_hash (32)]
  const data = new Uint8Array(33);
  data[0] = OreInstruction.DealVideoPoker;
  data.set(slotHash, 1);

  return new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: videoPokerGameAddress, isSigner: false, isWritable: true },
      { pubkey: videoPokerPositionAddress, isSigner: false, isWritable: true },
    ],
    data: Buffer.from(data),
  });
}

/**
 * Build a HoldAndDraw instruction.
 * Holds selected cards and draws replacements using slot_hash for RNG.
 */
export function createHoldAndDrawInstruction(
  signer: PublicKey,
  holdFlags: boolean[], // 5 booleans
  slotHash: Uint8Array
): TransactionInstruction {
  const [videoPokerGameAddress] = videoPokerGamePDA();
  const [videoPokerPositionAddress] = videoPokerPositionPDA(signer);

  // Convert hold flags to bitmask (1 byte)
  let holdMask = 0;
  for (let i = 0; i < 5 && i < holdFlags.length; i++) {
    if (holdFlags[i]) {
      holdMask |= (1 << i);
    }
  }

  // Build instruction data
  // Format: [discriminator (1)] [hold_mask (1)] [slot_hash (32)]
  const data = new Uint8Array(34);
  data[0] = OreInstruction.HoldAndDraw;
  data[1] = holdMask;
  data.set(slotHash, 2);

  return new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: videoPokerGameAddress, isSigner: false, isWritable: true },
      { pubkey: videoPokerPositionAddress, isSigner: false, isWritable: true },
    ],
    data: Buffer.from(data),
  });
}

/**
 * Build a ClaimVideoPokerWinnings instruction.
 * Claims pending winnings in VPK tokens.
 */
export function createClaimVideoPokerWinningsInstruction(
  signer: PublicKey
): TransactionInstruction {
  const [videoPokerGameAddress] = videoPokerGamePDA();
  const [videoPokerPositionAddress] = videoPokerPositionPDA(signer);
  const [videoPokerVaultAddress] = videoPokerVaultPDA();

  // VPK token accounts
  const signerVpkAta = getAssociatedTokenAddressSync(VPK_MINT, signer);
  const vaultVpkAta = getAssociatedTokenAddressSync(VPK_MINT, videoPokerVaultAddress, true);

  const data = new Uint8Array(1);
  data[0] = OreInstruction.ClaimVideoPokerWinnings;

  return new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: videoPokerGameAddress, isSigner: false, isWritable: true },
      { pubkey: videoPokerPositionAddress, isSigner: false, isWritable: true },
      { pubkey: videoPokerVaultAddress, isSigner: false, isWritable: false },
      { pubkey: signerVpkAta, isSigner: false, isWritable: true },
      { pubkey: vaultVpkAta, isSigner: false, isWritable: true },
      { pubkey: VPK_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

/**
 * Build a FundVideoPokerHouse instruction.
 * Funds the house bankroll with VPK tokens.
 */
export function createFundVideoPokerHouseInstruction(
  signer: PublicKey,
  amount: bigint
): TransactionInstruction {
  const [videoPokerGameAddress] = videoPokerGamePDA();
  const [videoPokerVaultAddress] = videoPokerVaultPDA();

  // VPK token accounts
  const signerVpkAta = getAssociatedTokenAddressSync(VPK_MINT, signer);
  const vaultVpkAta = getAssociatedTokenAddressSync(VPK_MINT, videoPokerVaultAddress, true);

  // Build instruction data
  // Format: [discriminator (1)] [amount (8)]
  const data = new Uint8Array(9);
  data[0] = OreInstruction.FundVideoPokerHouse;
  data.set(toLeBytes(amount, 8), 1);

  return new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: videoPokerGameAddress, isSigner: false, isWritable: true },
      { pubkey: videoPokerVaultAddress, isSigner: false, isWritable: false },
      { pubkey: signerVpkAta, isSigner: false, isWritable: true },
      { pubkey: vaultVpkAta, isSigner: false, isWritable: true },
      { pubkey: VPK_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

// ============================================================================
// VIDEO POKER ACCOUNT PARSING
// ============================================================================

// Minimum expected sizes for account validation
const VIDEO_POKER_GAME_MIN_SIZE = 8 + 48; // discriminator + struct
const VIDEO_POKER_POSITION_MIN_SIZE = 8 + 200; // discriminator + struct

// Parse VideoPokerGame account data
export function parseVideoPokerGame(data: Uint8Array | Buffer): VideoPokerGame {
  if (!data || data.length < VIDEO_POKER_GAME_MIN_SIZE) {
    throw new Error(`Invalid VideoPokerGame data: expected at least ${VIDEO_POKER_GAME_MIN_SIZE} bytes, got ${data?.length ?? 0}`);
  }

  let offset = 8; // Skip discriminator

  const epochId = fromLeBytes(data.slice(offset, offset + 8));
  offset += 8;

  const houseBankroll = fromLeBytes(data.slice(offset, offset + 8));
  offset += 8;

  const totalWagered = fromLeBytes(data.slice(offset, offset + 8));
  offset += 8;

  const totalPaid = fromLeBytes(data.slice(offset, offset + 8));
  offset += 8;

  const gamesPlayed = fromLeBytes(data.slice(offset, offset + 8));
  offset += 8;

  return {
    epochId,
    houseBankroll,
    totalWagered,
    totalPaid,
    gamesPlayed,
  };
}

// Parse VideoPokerPosition account data
export function parseVideoPokerPosition(data: Uint8Array | Buffer): VideoPokerPosition {
  if (!data || data.length < VIDEO_POKER_POSITION_MIN_SIZE) {
    throw new Error(`Invalid VideoPokerPosition data: expected at least ${VIDEO_POKER_POSITION_MIN_SIZE} bytes, got ${data?.length ?? 0}`);
  }

  let offset = 8; // Skip discriminator

  const authority = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const state = data[offset];
  offset += 1;

  const coins = data[offset];
  offset += 1;

  offset += 6; // padding

  const betPerCoin = fromLeBytes(data.slice(offset, offset + 8));
  offset += 8;

  // Hand (5 cards)
  const hand: number[] = [];
  for (let i = 0; i < 5; i++) {
    hand.push(data[offset]);
    offset += 1;
  }

  offset += 3; // padding

  // Held flags (5 booleans)
  const held: boolean[] = [];
  for (let i = 0; i < 5; i++) {
    held.push(data[offset] === 1);
    offset += 1;
  }

  offset += 3; // padding

  const finalHand = data[offset];
  offset += 1;

  offset += 7; // padding

  const pendingWinnings = fromLeBytes(data.slice(offset, offset + 8));
  offset += 8;

  const totalWagered = fromLeBytes(data.slice(offset, offset + 8));
  offset += 8;

  const totalWon = fromLeBytes(data.slice(offset, offset + 8));
  offset += 8;

  const totalLost = fromLeBytes(data.slice(offset, offset + 8));
  offset += 8;

  const gamesPlayed = fromLeBytes(data.slice(offset, offset + 8));
  offset += 8;

  const bestHand = data[offset];
  offset += 1;

  return {
    authority,
    state,
    coins,
    betPerCoin,
    hand,
    held,
    finalHand,
    pendingWinnings,
    totalWagered,
    totalWon,
    totalLost,
    gamesPlayed,
    bestHand,
  };
}

// ============================================================================
// VIDEO POKER UTILITY FUNCTIONS
// ============================================================================

// Card display helpers
export function getCardRank(card: number): string {
  if (card === VP_NO_CARD) return "?";
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  return ranks[card % 13];
}

export function getCardSuit(card: number): string {
  if (card === VP_NO_CARD) return "";
  const suits = ["♥", "♦", "♣", "♠"];
  return suits[Math.floor(card / 13)];
}

export function getCardColor(card: number): "red" | "black" {
  if (card === VP_NO_CARD) return "black";
  const suit = Math.floor(card / 13);
  return suit < 2 ? "red" : "black"; // Hearts and Diamonds are red
}

export function getHandName(handRank: number): string {
  switch (handRank) {
    case VP_HAND_NOTHING: return "High Card";
    case VP_HAND_JACKS_OR_BETTER: return "Jacks or Better";
    case VP_HAND_TWO_PAIR: return "Two Pair";
    case VP_HAND_THREE_OF_A_KIND: return "Three of a Kind";
    case VP_HAND_STRAIGHT: return "Straight";
    case VP_HAND_FLUSH: return "Flush";
    case VP_HAND_FULL_HOUSE: return "Full House";
    case VP_HAND_FOUR_OF_A_KIND: return "Four of a Kind";
    case VP_HAND_STRAIGHT_FLUSH: return "Straight Flush";
    case VP_HAND_ROYAL_FLUSH: return "Royal Flush";
    default: return "Unknown";
  }
}

export function getHandPayout(handRank: number, coins: number): number {
  if (handRank === VP_HAND_NOTHING) return 0;

  // Royal Flush special case: 800x at 5 coins
  if (handRank === VP_HAND_ROYAL_FLUSH && coins === 5) {
    return 800;
  }

  const basePayout = VP_PAY_TABLE[handRank] || 0;
  return basePayout * coins;
}
```

## Note

These additions should be inserted into program.ts before the `// RE-EXPORTS` section (around line 2916).
The instruction discriminators (64-68) have already been added to the OreInstruction enum.
