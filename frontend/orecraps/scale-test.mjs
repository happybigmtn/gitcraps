import { createSolanaRpc } from "@solana/kit";

const LOCALNET_RPC = "http://127.0.0.1:8899";
const API_BASE = "http://localhost:3000/api";

// Scale test configuration
const CONFIG = {
  numBots: 100,           // Number of simulated bots
  numEpochs: 100,         // Number of epochs to run
  betsPerBot: 3,          // Bets per bot per epoch
  concurrentBatches: 10,  // Concurrent bet batches
  betAmount: 0.001,       // SOL per bet (small for stress testing)
  rollsPerEpoch: 5,       // Dice rolls per epoch
};

// CrapsBetType enum values
const CrapsBetType = {
  PassLine: 0, DontPass: 1, PassOdds: 2, DontPassOdds: 3,
  Come: 4, DontCome: 5, ComeOdds: 6, DontComeOdds: 7,
  Place: 8, Hardway: 9, Field: 10, AnySeven: 11,
  AnyCraps: 12, YoEleven: 13, Aces: 14, Twelve: 15,
};

// All possible bets for random selection
const ALL_BETS = [
  { betType: CrapsBetType.PassLine, point: 0 },
  { betType: CrapsBetType.DontPass, point: 0 },
  { betType: CrapsBetType.Field, point: 0 },
  { betType: CrapsBetType.AnySeven, point: 0 },
  { betType: CrapsBetType.AnyCraps, point: 0 },
  { betType: CrapsBetType.YoEleven, point: 0 },
  { betType: CrapsBetType.Aces, point: 0 },
  { betType: CrapsBetType.Twelve, point: 0 },
  { betType: CrapsBetType.Come, point: 4 },
  { betType: CrapsBetType.Come, point: 5 },
  { betType: CrapsBetType.DontCome, point: 6 },
  { betType: CrapsBetType.DontCome, point: 8 },
  { betType: CrapsBetType.Place, point: 4 },
  { betType: CrapsBetType.Place, point: 5 },
  { betType: CrapsBetType.Place, point: 6 },
  { betType: CrapsBetType.Place, point: 8 },
  { betType: CrapsBetType.Place, point: 9 },
  { betType: CrapsBetType.Place, point: 10 },
  { betType: CrapsBetType.Hardway, point: 4 },
  { betType: CrapsBetType.Hardway, point: 6 },
  { betType: CrapsBetType.Hardway, point: 8 },
  { betType: CrapsBetType.Hardway, point: 10 },
];

// Metrics tracking
const metrics = {
  totalBetsAttempted: 0,
  totalBetsSucceeded: 0,
  totalBetsFailed: 0,
  totalRolls: 0,
  epochsCompleted: 0,
  errors: {},
  latencies: [],
  peakConcurrency: 0,
  startTime: null,
  endTime: null,
  betsPerSecond: [],
  errorsByEpoch: [],
  successRateByEpoch: [],
};

function randomBet() {
  const bet = ALL_BETS[Math.floor(Math.random() * ALL_BETS.length)];
  return { ...bet, amount: CONFIG.betAmount };
}

async function placeBet(botId, bet) {
  const start = Date.now();
  try {
    const response = await fetch(`${API_BASE}/place-bet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bets: [bet] }),
    });
    const result = await response.json();
    const latency = Date.now() - start;
    metrics.latencies.push(latency);

    if (result.success) {
      metrics.totalBetsSucceeded++;
      return { success: true, latency, botId };
    } else {
      metrics.totalBetsFailed++;
      const errorKey = result.error?.substring(0, 50) || "Unknown error";
      metrics.errors[errorKey] = (metrics.errors[errorKey] || 0) + 1;
      return { success: false, error: result.error, latency, botId };
    }
  } catch (err) {
    metrics.totalBetsFailed++;
    const errorKey = err.message?.substring(0, 50) || "Network error";
    metrics.errors[errorKey] = (metrics.errors[errorKey] || 0) + 1;
    return { success: false, error: err.message, latency: Date.now() - start, botId };
  } finally {
    metrics.totalBetsAttempted++;
  }
}

async function simulateRoll() {
  try {
    const response = await fetch(`${API_BASE}/simulate-roll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const result = await response.json();
    metrics.totalRolls++;
    return result.diceResults || {};
  } catch (err) {
    return { error: err.message };
  }
}

async function runBotBatch(bots, epoch) {
  const promises = bots.map(async (botId) => {
    const results = [];
    for (let b = 0; b < CONFIG.betsPerBot; b++) {
      const bet = randomBet();
      const result = await placeBet(botId, bet);
      results.push(result);
      // Small delay between bets from same bot
      await new Promise(r => setTimeout(r, 10));
    }
    return results;
  });
  return Promise.all(promises);
}

async function runEpoch(epochNum) {
  const epochStart = Date.now();
  let epochSuccess = 0;
  let epochFailed = 0;

  process.stdout.write(`\rEpoch ${epochNum.toString().padStart(3)}/${CONFIG.numEpochs} | `);

  // Split bots into batches for concurrent execution
  const batchSize = Math.ceil(CONFIG.numBots / CONFIG.concurrentBatches);
  const batches = [];
  for (let i = 0; i < CONFIG.numBots; i += batchSize) {
    batches.push(
      Array.from({ length: Math.min(batchSize, CONFIG.numBots - i) }, (_, j) => i + j)
    );
  }

  // Run batches concurrently
  for (const batch of batches) {
    const batchResults = await runBotBatch(batch, epochNum);
    for (const botResults of batchResults) {
      for (const result of botResults) {
        if (result.success) epochSuccess++;
        else epochFailed++;
      }
    }
  }

  // Simulate dice rolls
  for (let r = 0; r < CONFIG.rollsPerEpoch; r++) {
    await simulateRoll();
  }

  const epochDuration = (Date.now() - epochStart) / 1000;
  const betsThisEpoch = epochSuccess + epochFailed;
  const bps = betsThisEpoch / epochDuration;

  metrics.betsPerSecond.push(bps);
  metrics.successRateByEpoch.push(epochSuccess / betsThisEpoch * 100);
  metrics.errorsByEpoch.push(epochFailed);
  metrics.epochsCompleted++;

  process.stdout.write(
    `Bets: ${epochSuccess}/${betsThisEpoch} (${(epochSuccess/betsThisEpoch*100).toFixed(1)}%) | ` +
    `${bps.toFixed(1)} bets/sec | ` +
    `Latency: ${Math.round(metrics.latencies.slice(-betsThisEpoch).reduce((a,b)=>a+b,0)/betsThisEpoch)}ms`
  );

  return { epochSuccess, epochFailed, epochDuration };
}

function printReport() {
  console.log("\n\n" + "=".repeat(80));
  console.log("SCALE TEST REPORT - " + CONFIG.numBots + " BOTS x " + CONFIG.numEpochs + " EPOCHS");
  console.log("=".repeat(80));

  const duration = (metrics.endTime - metrics.startTime) / 1000;
  const avgLatency = metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length;
  const minLatency = Math.min(...metrics.latencies);
  const maxLatency = Math.max(...metrics.latencies);
  const p50 = metrics.latencies.sort((a, b) => a - b)[Math.floor(metrics.latencies.length * 0.5)];
  const p95 = metrics.latencies.sort((a, b) => a - b)[Math.floor(metrics.latencies.length * 0.95)];
  const p99 = metrics.latencies.sort((a, b) => a - b)[Math.floor(metrics.latencies.length * 0.99)];
  const avgBps = metrics.betsPerSecond.reduce((a, b) => a + b, 0) / metrics.betsPerSecond.length;
  const successRate = (metrics.totalBetsSucceeded / metrics.totalBetsAttempted * 100).toFixed(2);

  console.log("\n--- OVERVIEW ---");
  console.log(`Duration:           ${duration.toFixed(1)} seconds`);
  console.log(`Total Bets:         ${metrics.totalBetsAttempted}`);
  console.log(`Successful:         ${metrics.totalBetsSucceeded} (${successRate}%)`);
  console.log(`Failed:             ${metrics.totalBetsFailed}`);
  console.log(`Total Rolls:        ${metrics.totalRolls}`);
  console.log(`Epochs Completed:   ${metrics.epochsCompleted}`);

  console.log("\n--- THROUGHPUT ---");
  console.log(`Avg Bets/Second:    ${avgBps.toFixed(2)}`);
  console.log(`Peak Bets/Second:   ${Math.max(...metrics.betsPerSecond).toFixed(2)}`);
  console.log(`Min Bets/Second:    ${Math.min(...metrics.betsPerSecond).toFixed(2)}`);

  console.log("\n--- LATENCY (ms) ---");
  console.log(`Average:            ${avgLatency.toFixed(1)}`);
  console.log(`Min:                ${minLatency}`);
  console.log(`Max:                ${maxLatency}`);
  console.log(`P50 (median):       ${p50}`);
  console.log(`P95:                ${p95}`);
  console.log(`P99:                ${p99}`);

  console.log("\n--- SUCCESS RATE BY EPOCH QUARTILE ---");
  const q1 = metrics.successRateByEpoch.slice(0, 25);
  const q2 = metrics.successRateByEpoch.slice(25, 50);
  const q3 = metrics.successRateByEpoch.slice(50, 75);
  const q4 = metrics.successRateByEpoch.slice(75, 100);
  console.log(`Epochs 1-25:        ${(q1.reduce((a,b)=>a+b,0)/q1.length).toFixed(2)}%`);
  console.log(`Epochs 26-50:       ${(q2.reduce((a,b)=>a+b,0)/q2.length).toFixed(2)}%`);
  console.log(`Epochs 51-75:       ${(q3.reduce((a,b)=>a+b,0)/q3.length).toFixed(2)}%`);
  console.log(`Epochs 76-100:      ${(q4.reduce((a,b)=>a+b,0)/q4.length).toFixed(2)}%`);

  if (Object.keys(metrics.errors).length > 0) {
    console.log("\n--- ERRORS ---");
    const sortedErrors = Object.entries(metrics.errors)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
    for (const [error, count] of sortedErrors) {
      console.log(`  ${count.toString().padStart(6)}x  ${error}`);
    }
  }

  // Identify production issues
  console.log("\n--- PRODUCTION RISK ASSESSMENT ---");
  const issues = [];

  if (successRate < 99) {
    issues.push(`[HIGH] Success rate ${successRate}% is below 99% threshold`);
  }
  if (p99 > 5000) {
    issues.push(`[HIGH] P99 latency ${p99}ms exceeds 5 second threshold`);
  }
  if (p95 > 2000) {
    issues.push(`[MEDIUM] P95 latency ${p95}ms exceeds 2 second threshold`);
  }
  if (maxLatency > 30000) {
    issues.push(`[HIGH] Max latency ${maxLatency}ms indicates timeout issues`);
  }
  if (avgBps < 5) {
    issues.push(`[MEDIUM] Avg throughput ${avgBps.toFixed(1)} bets/sec may be too low`);
  }

  // Check for degradation over time
  const earlySuccessRate = q1.reduce((a,b)=>a+b,0)/q1.length;
  const lateSuccessRate = q4.reduce((a,b)=>a+b,0)/q4.length;
  if (lateSuccessRate < earlySuccessRate - 5) {
    issues.push(`[MEDIUM] Performance degradation: ${earlySuccessRate.toFixed(1)}% -> ${lateSuccessRate.toFixed(1)}%`);
  }

  // Memory/resource exhaustion indicators
  const latencyTrend = metrics.latencies.slice(-1000).reduce((a,b)=>a+b,0)/1000 -
                       metrics.latencies.slice(0, 1000).reduce((a,b)=>a+b,0)/1000;
  if (latencyTrend > 500) {
    issues.push(`[MEDIUM] Latency increasing over time (${latencyTrend.toFixed(0)}ms drift) - possible memory leak`);
  }

  if (issues.length === 0) {
    console.log("  [OK] No significant production issues identified");
  } else {
    for (const issue of issues) {
      console.log(`  ${issue}`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("TEST COMPLETE");
  console.log("=".repeat(80) + "\n");

  return {
    duration,
    totalBets: metrics.totalBetsAttempted,
    successRate: parseFloat(successRate),
    avgLatency,
    p95,
    p99,
    avgBps,
    issues,
  };
}

async function main() {
  console.log("=".repeat(80));
  console.log("ORECRAPS SCALE TEST");
  console.log("=".repeat(80));
  console.log(`Configuration:`);
  console.log(`  Bots:              ${CONFIG.numBots}`);
  console.log(`  Epochs:            ${CONFIG.numEpochs}`);
  console.log(`  Bets per bot:      ${CONFIG.betsPerBot}`);
  console.log(`  Concurrent batches: ${CONFIG.concurrentBatches}`);
  console.log(`  Total bets:        ${CONFIG.numBots * CONFIG.numEpochs * CONFIG.betsPerBot}`);
  console.log("=".repeat(80) + "\n");

  // Verify connection
  console.log("Verifying localnet connection...");
  try {
    const rpc = createSolanaRpc(LOCALNET_RPC);
    const slot = await rpc.getSlot().send();
    console.log(`Connected to localnet (slot ${slot})\n`);
  } catch (err) {
    console.error("Failed to connect to localnet:", err.message);
    process.exit(1);
  }

  // Verify API
  console.log("Verifying API connection...");
  try {
    const response = await fetch(`${API_BASE}/simulate-roll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    console.log("API connected\n");
  } catch (err) {
    console.error("Failed to connect to API:", err.message);
    process.exit(1);
  }

  console.log("Starting scale test...\n");
  metrics.startTime = Date.now();

  for (let epoch = 1; epoch <= CONFIG.numEpochs; epoch++) {
    await runEpoch(epoch);
    console.log(); // newline after each epoch
  }

  metrics.endTime = Date.now();
  return printReport();
}

main().catch(console.error);
