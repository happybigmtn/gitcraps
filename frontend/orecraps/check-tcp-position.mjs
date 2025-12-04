/**
 * Check TCP Position state in detail
 */
import { Connection, PublicKey } from '@solana/web3.js';

const DEVNET_RPC = 'https://api.devnet.solana.com';
const POSITION = new PublicKey('7NFV6st36E3DuZWn9AttCF8r5bqjvtD9ZyzrPDqPof52');

async function main() {
  const connection = new Connection(DEVNET_RPC, 'confirmed');

  const info = await connection.getAccountInfo(POSITION);
  if (!info) {
    console.log('Position does not exist');
    return;
  }

  const data = info.data;
  console.log('Position account data length:', data.length);

  const authority = new PublicKey(data.slice(0, 32));
  const epoch_id = data.readBigUInt64LE(32);
  const round_id = data.readBigUInt64LE(40);
  const total_wagered_all_time = data.readBigUInt64LE(48);
  const total_winnings_all_time = data.readBigUInt64LE(56);
  const total_lost_all_time = data.readBigUInt64LE(64);
  const state = data[72];
  const ante = data.readBigUInt64LE(80);
  const play = data.readBigUInt64LE(88);
  const pair_plus = data.readBigUInt64LE(96);
  const total_wagered = data.readBigUInt64LE(104);
  const pending_winnings = data.readBigUInt64LE(112);
  const total_lost = data.readBigUInt64LE(120);
  const player_cards = [data[128], data[129], data[130]];
  const dealer_cards = [data[131], data[132], data[133]];
  const player_hand_rank = data[134];
  const dealer_hand_rank = data[135];
  const dealer_qualifies = data[136];

  const stateNames = ['None', 'Betting', 'Dealt', 'Settled'];
  const rankNames = ['High Card', 'Pair', 'Flush', 'Straight', 'Three of a Kind', 'Straight Flush'];

  console.log('\n=== ThreeCard Position ===');
  console.log('Authority:', authority.toBase58());
  console.log('Epoch ID:', epoch_id.toString());
  console.log('Round ID:', round_id.toString());
  console.log('State:', state, '(' + (stateNames[state] || 'Unknown') + ')');
  console.log('Ante:', Number(ante) / 1e9, 'TCP');
  console.log('Play:', Number(play) / 1e9, 'TCP');
  console.log('Pair Plus:', Number(pair_plus) / 1e9, 'TCP');
  console.log('Total Wagered (round):', Number(total_wagered) / 1e9, 'TCP');
  console.log('Pending Winnings:', Number(pending_winnings) / 1e9, 'TCP');
  console.log('Total Lost (round):', Number(total_lost) / 1e9, 'TCP');
  console.log('Player Cards:', player_cards);
  console.log('Dealer Cards:', dealer_cards);
  console.log('Player Hand Rank:', player_hand_rank);
  console.log('Dealer Hand Rank:', dealer_hand_rank);
  console.log('Dealer Qualifies:', dealer_qualifies === 1 ? 'Yes' : 'No');

  // Analysis
  console.log('\n=== Analysis ===');
  const total_active_bets = Number(ante + play + pair_plus);
  console.log('total_active_bets():', total_active_bets);
  console.log('has_active_bets():', total_active_bets > 0);
}

main().catch(console.error);
