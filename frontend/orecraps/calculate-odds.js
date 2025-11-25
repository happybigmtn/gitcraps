// Simulate bonus bet probabilities
// Rolling 2d6 until a 7, tracking unique sums (2-6, 8-12)

const SIMULATIONS = 1000000;

// Generate random roll
function rollDice() {
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  return die1 + die2;
}

// Track outcomes
const results = {
  0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0
};

let totalRolls = 0;

for (let i = 0; i < SIMULATIONS; i++) {
  const uniqueSums = new Set();
  let rolls = 0;

  while (true) {
    const sum = rollDice();
    rolls++;

    if (sum === 7) {
      // Epoch ends
      results[uniqueSums.size]++;
      totalRolls += rolls;
      break;
    }

    uniqueSums.add(sum);
  }
}

console.log('\nBonus Bet Probability Distribution (unique non-7 sums before 7):');
console.log('==========================================');

for (let i = 0; i <= 10; i++) {
  const prob = results[i] / SIMULATIONS;
  const percentage = (prob * 100).toFixed(4);
  const trueOdds = prob > 0 ? (1 / prob).toFixed(2) : 'N/A';
  const fairPayout = prob > 0 ? ((1 / prob) - 1).toFixed(2) : 'N/A';
  console.log(`  ${i} unique sums: ${percentage}% (1 in ${trueOdds}, fair payout: ${fairPayout}:1)`);
}

console.log(`\nAverage rolls per epoch: ${(totalRolls / SIMULATIONS).toFixed(2)}`);

// Calculate cumulative probabilities for "5 or more unique sums"
console.log('\nBonus Bet Payouts (hitting N or more unique sums):');
console.log('==========================================');

let cumulative = 0;
for (let i = 10; i >= 5; i--) {
  cumulative += results[i] / SIMULATIONS;
  const fairPayout = cumulative > 0 ? ((1 / cumulative) - 1).toFixed(2) : 'N/A';
  const housePayout = cumulative > 0 ? Math.floor((1 / cumulative) - 1) : 0;
  console.log(`  ${i}+ unique sums: ${(cumulative * 100).toFixed(4)}% (fair: ${fairPayout}:1, house: ${housePayout}:1)`);
}

// Individual payouts for hitting exactly N
console.log('\nExact Match Payouts:');
console.log('==========================================');
for (let i = 5; i <= 10; i++) {
  const prob = results[i] / SIMULATIONS;
  if (prob > 0) {
    const fairPayout = ((1 / prob) - 1).toFixed(2);
    console.log(`  Exactly ${i} unique sums: ${(prob * 100).toFixed(4)}% (fair payout: ${fairPayout}:1)`);
  }
}
