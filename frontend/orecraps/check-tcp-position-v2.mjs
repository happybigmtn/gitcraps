import { Connection, PublicKey } from '@solana/web3.js';

const DEVNET_RPC = 'https://api.devnet.solana.com';
const ORE_PROGRAM_ID = new PublicKey('JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK');
const POSITION = new PublicKey('7NFV6st36E3DuZWn9AttCF8r5bqjvtD9ZyzrPDqPof52');
const PAYER = new PublicKey('gUHM7aKpe5grLDvZq3sBMAwP68rwnPe5NJnULBc5t2C');

// Correct struct layout from threecard_position.rs:
// authority: Pubkey                   32 bytes, offset 0
// epoch_id: u64                        8 bytes, offset 32
// round_id: u64                        8 bytes, offset 40
// state: u8                            1 byte,  offset 48
// _padding1: [u8; 7]                   7 bytes, offset 49
// ante: u64                            8 bytes, offset 56
// play: u64                            8 bytes, offset 64
// pair_plus: u64                       8 bytes, offset 72
// player_cards: [u8; 3]                3 bytes, offset 80
// dealer_cards: [u8; 3]                3 bytes, offset 83
// _padding2: [u8; 2]                   2 bytes, offset 86
// player_hand_rank: u8                 1 byte,  offset 88
// dealer_hand_rank: u8                 1 byte,  offset 89
// dealer_qualifies: u8                 1 byte,  offset 90
// _padding3: [u8; 5]                   5 bytes, offset 91
// pending_winnings: u64                8 bytes, offset 96
// total_wagered: u64                   8 bytes, offset 104
// total_won: u64                       8 bytes, offset 112
// total_lost: u64                      8 bytes, offset 120
// Total: 128 bytes

async function main() {
  const connection = new Connection(DEVNET_RPC, 'confirmed');

  // Derive expected position PDA for our payer
  const THREECARD_POSITION = Buffer.from('threecard_position');
  const [derivedPosition] = PublicKey.findProgramAddressSync(
    [THREECARD_POSITION, PAYER.toBytes()],
    ORE_PROGRAM_ID
  );

  console.log('Payer:', PAYER.toBase58());
  console.log('Expected Position PDA:', derivedPosition.toBase58());
  console.log('Checking Position:', POSITION.toBase58());
  console.log('Match:', derivedPosition.equals(POSITION));

  const info = await connection.getAccountInfo(POSITION);
  if (!info) {
    console.log('\nPosition does not exist');
    return;
  }

  const data = info.data;
  console.log('\nAccount data length:', data.length);

  // Try with 8-byte discriminator prefix (like Anchor)
  const hasDiscriminator = data.length === 136; // 8 + 128 = 136
  const offset = hasDiscriminator ? 8 : 0;

  console.log('Has discriminator:', hasDiscriminator);
  if (hasDiscriminator) {
    console.log('Discriminator:', data.slice(0, 8).toString('hex'));
  }

  const authority = new PublicKey(data.slice(offset + 0, offset + 32));
  const epoch_id = data.readBigUInt64LE(offset + 32);
  const round_id = data.readBigUInt64LE(offset + 40);
  const state = data[offset + 48];
  const ante = data.readBigUInt64LE(offset + 56);
  const play = data.readBigUInt64LE(offset + 64);
  const pair_plus = data.readBigUInt64LE(offset + 72);
  const player_cards = [data[offset + 80], data[offset + 81], data[offset + 82]];
  const dealer_cards = [data[offset + 83], data[offset + 84], data[offset + 85]];
  const player_hand_rank = data[offset + 88];
  const dealer_hand_rank = data[offset + 89];
  const dealer_qualifies = data[offset + 90];
  const pending_winnings = data.readBigUInt64LE(offset + 96);
  const total_wagered = data.readBigUInt64LE(offset + 104);
  const total_won = data.readBigUInt64LE(offset + 112);
  const total_lost = data.readBigUInt64LE(offset + 120);

  const stateNames = ['Betting', 'Dealt', 'Decided', 'Settled'];

  console.log('\n=== ThreeCard Position ===');
  console.log('Authority:', authority.toBase58());
  console.log('Authority matches payer:', authority.equals(PAYER));
  console.log('');
  console.log('State:', state, '(' + (stateNames[state] || 'Unknown') + ')');
  console.log('Epoch ID:', epoch_id.toString());
  console.log('Round ID:', round_id.toString());
  console.log('');
  console.log('Ante:', Number(ante) / 1e9, 'TCP');
  console.log('Play:', Number(play) / 1e9, 'TCP');
  console.log('Pair Plus:', Number(pair_plus) / 1e9, 'TCP');
  console.log('');
  console.log('Player Cards:', player_cards);
  console.log('Dealer Cards:', dealer_cards);
  console.log('Player Hand Rank:', player_hand_rank);
  console.log('Dealer Hand Rank:', dealer_hand_rank);
  console.log('Dealer Qualifies:', dealer_qualifies);
  console.log('');
  console.log('Pending Winnings:', Number(pending_winnings) / 1e9, 'TCP');
  console.log('Total Wagered:', Number(total_wagered) / 1e9, 'TCP');
  console.log('Total Won:', Number(total_won) / 1e9, 'TCP');
  console.log('Total Lost:', Number(total_lost) / 1e9, 'TCP');
  console.log('');
  console.log('total_active_bets():', Number(ante + play + pair_plus));
  console.log('has_active_bets():', Number(ante + play + pair_plus) > 0);
}

main().catch(console.error);
