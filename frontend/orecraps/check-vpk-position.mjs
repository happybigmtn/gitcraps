import { Connection, PublicKey } from "@solana/web3.js";

const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const SIGNER = new PublicKey("gUHM7aKpe5grLDvZq3sBMAwP68rwnPe5NJnULBc5t2C");

const connection = new Connection(DEVNET_RPC, "confirmed");

const [vpkPosition] = PublicKey.findProgramAddressSync(
  [Buffer.from("video_poker_position"), SIGNER.toBuffer()],
  ORE_PROGRAM_ID
);

console.log("VPK Position PDA:", vpkPosition.toBase58());

const account = await connection.getAccountInfo(vpkPosition);
if (!account) {
  console.log("No VPK position found");
  process.exit(0);
}

console.log("Account data length:", account.data.length);

// VideoPokerPosition struct (with 8-byte discriminator from steel account! macro):
// - discriminator: u64 (8)
// - authority: Pubkey (32)
// - round_id: u64 (8)
// - state: u8 (1) - 0=None, 1=Dealt, 2=Held, 3=Drawn, 4=Settled
// - hand: [u8; 5]
// - final_hand: [u8; 5]
// - _padding: [u8; 4]
// - coins: u64 (8)
// - amount_per_coin: u64 (8)
// - payout: u64 (8)
// - pending_winnings: u64 (8)
// ...

const data = account.data;
// VideoPokerPosition struct layout (with 8-byte discriminator from steel account! macro):
// - discriminator: 8 bytes (0-7)
// - authority: 32 bytes (8-39)
// - epoch_id: 8 bytes (40-47)
// - round_id: 8 bytes (48-55)
// - state: 1 byte (56)
// - bet_coins: 1 byte (57)
// - card_index: 1 byte (58)
// - held_mask: 1 byte (59)
// - hand_rank: 1 byte (60)
// - _padding1: 3 bytes (61-63)
// - bet_amount: 8 bytes (64-71)
// - initial_cards: 5 bytes (72-76)
// - final_cards: 5 bytes (77-81)
// - _padding2: 6 bytes (82-87)
// - pending_winnings: 8 bytes (88-95)
// - total_wagered: 8 bytes (96-103)
// - total_won: 8 bytes (104-111)
// - total_lost: 8 bytes (112-119)
// - last_updated_round: 8 bytes (120-127)
const offsets = {
  discriminator: 0,
  authority: 8,
  epoch_id: 40,
  round_id: 48,
  state: 56,
  bet_coins: 57,
  card_index: 58,
  held_mask: 59,
  hand_rank: 60,
  _padding1: 61,
  bet_amount: 64,
  initial_cards: 72,
  final_cards: 77,
  _padding2: 82,
  pending_winnings: 88,
  total_wagered: 96,
  total_won: 104,
  total_lost: 112,
  last_updated_round: 120,
};

// States: 0=None, 1=Betting, 2=Dealt, 3=Held, 4=Settled
const stateNames = ["None", "Betting", "Dealt", "Held", "Settled"];

console.log("\n=== VPK Position State ===");
console.log("Discriminator:", data.readBigUInt64LE(offsets.discriminator).toString());
console.log("Authority:", new PublicKey(data.slice(offsets.authority, offsets.authority + 32)).toBase58());
console.log("Epoch ID:", data.readBigUInt64LE(offsets.epoch_id).toString());
console.log("Round ID:", data.readBigUInt64LE(offsets.round_id).toString());
console.log("State:", data[offsets.state], `(${stateNames[data[offsets.state]] || "Unknown"})`);
console.log("Bet coins:", data[offsets.bet_coins]);
console.log("Card index:", data[offsets.card_index]);
console.log("Held mask:", data[offsets.held_mask].toString(2).padStart(5, '0'));
console.log("Hand rank:", data[offsets.hand_rank]);
console.log("\n=== Bet ===");
console.log("Bet amount:", data.readBigUInt64LE(offsets.bet_amount).toString());
console.log("\n=== Cards ===");
const initCards = offsets.initial_cards;
const finalCards = offsets.final_cards;
console.log("Initial cards:", [data[initCards], data[initCards + 1], data[initCards + 2], data[initCards + 3], data[initCards + 4]]);
console.log("Final cards:", [data[finalCards], data[finalCards + 1], data[finalCards + 2], data[finalCards + 3], data[finalCards + 4]]);
console.log("\n=== Results ===");
console.log("Pending winnings:", data.readBigUInt64LE(offsets.pending_winnings).toString());
console.log("Total wagered:", data.readBigUInt64LE(offsets.total_wagered).toString());
console.log("Total won:", data.readBigUInt64LE(offsets.total_won).toString());
console.log("Total lost:", data.readBigUInt64LE(offsets.total_lost).toString());
console.log("Last updated round:", data.readBigUInt64LE(offsets.last_updated_round).toString());
