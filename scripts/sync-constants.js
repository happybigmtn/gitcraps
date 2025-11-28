#!/usr/bin/env node
/**
 * Sync constants from Rust to TypeScript
 *
 * This script extracts constant values from api/src/consts.rs and generates
 * a TypeScript file with the same constants for the frontend.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const RUST_CONSTS_PATH = path.join(PROJECT_ROOT, 'api/src/consts.rs');
const TS_OUTPUT_PATH = path.join(PROJECT_ROOT, 'frontend/orecraps/src/generated/constants.ts');

/**
 * Parse a Rust constant declaration
 * @param {string} line - Line containing the constant
 * @returns {{name: string, value: string, type: string} | null}
 */
function parseConstant(line) {
  // Match: pub const NAME: type = value;
  const match = line.match(/pub const ([A-Z_0-9]+):\s*(\w+)\s*=\s*(.+?);/);
  if (match) {
    return {
      name: match[1],
      value: match[2],
      type: match[3],
    };
  }
  return null;
}

/**
 * Extract payout constants from Rust source
 * @param {string} rustSource - The Rust source code
 * @returns {Object} Payout constants grouped by type
 */
function extractPayoutConstants(rustSource) {
  const lines = rustSource.split('\n');
  const payouts = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Pass Line / Don't Pass
    if (line.includes('PASS_LINE_PAYOUT_NUM')) {
      const numMatch = line.match(/=\s*(\d+)/);
      if (numMatch) payouts.passLineNum = numMatch[1];
    }
    if (line.includes('PASS_LINE_PAYOUT_DEN')) {
      const denMatch = line.match(/=\s*(\d+)/);
      if (denMatch) payouts.passLineDen = denMatch[1];
    }

    // Field bets
    if (line.includes('FIELD_PAYOUT_NORMAL_NUM')) {
      const numMatch = line.match(/=\s*(\d+)/);
      if (numMatch) payouts.fieldNormalNum = numMatch[1];
    }
    if (line.includes('FIELD_PAYOUT_NORMAL_DEN')) {
      const denMatch = line.match(/=\s*(\d+)/);
      if (denMatch) payouts.fieldNormalDen = denMatch[1];
    }
    if (line.includes('FIELD_PAYOUT_2_12_NUM')) {
      const numMatch = line.match(/=\s*(\d+)/);
      if (numMatch) payouts.field2_12Num = numMatch[1];
    }
    if (line.includes('FIELD_PAYOUT_2_12_DEN')) {
      const denMatch = line.match(/=\s*(\d+)/);
      if (denMatch) payouts.field2_12Den = denMatch[1];
    }

    // Any Seven
    if (line.includes('ANY_SEVEN_PAYOUT_NUM')) {
      const numMatch = line.match(/=\s*(\d+)/);
      if (numMatch) payouts.anySevenNum = numMatch[1];
    }
    if (line.includes('ANY_SEVEN_PAYOUT_DEN')) {
      const denMatch = line.match(/=\s*(\d+)/);
      if (denMatch) payouts.anySevenDen = denMatch[1];
    }

    // Any Craps
    if (line.includes('ANY_CRAPS_PAYOUT_NUM')) {
      const numMatch = line.match(/=\s*(\d+)/);
      if (numMatch) payouts.anyCrapsNum = numMatch[1];
    }
    if (line.includes('ANY_CRAPS_PAYOUT_DEN')) {
      const denMatch = line.match(/=\s*(\d+)/);
      if (denMatch) payouts.anyCrapsDen = denMatch[1];
    }

    // Yo Eleven
    if (line.includes('YO_ELEVEN_PAYOUT_NUM')) {
      const numMatch = line.match(/=\s*(\d+)/);
      if (numMatch) payouts.yoElevenNum = numMatch[1];
    }
    if (line.includes('YO_ELEVEN_PAYOUT_DEN')) {
      const denMatch = line.match(/=\s*(\d+)/);
      if (denMatch) payouts.yoElevenDen = denMatch[1];
    }

    // Aces
    if (line.includes('ACES_PAYOUT_NUM')) {
      const numMatch = line.match(/=\s*(\d+)/);
      if (numMatch) payouts.acesNum = numMatch[1];
    }
    if (line.includes('ACES_PAYOUT_DEN')) {
      const denMatch = line.match(/=\s*(\d+)/);
      if (denMatch) payouts.acesDen = denMatch[1];
    }

    // Twelve
    if (line.includes('TWELVE_PAYOUT_NUM')) {
      const numMatch = line.match(/=\s*(\d+)/);
      if (numMatch) payouts.twelveNum = numMatch[1];
    }
    if (line.includes('TWELVE_PAYOUT_DEN')) {
      const denMatch = line.match(/=\s*(\d+)/);
      if (denMatch) payouts.twelveDen = denMatch[1];
    }

    // Place bets
    if (line.includes('PLACE_4_10_PAYOUT_NUM')) {
      const numMatch = line.match(/=\s*(\d+)/);
      if (numMatch) payouts.place4_10Num = numMatch[1];
    }
    if (line.includes('PLACE_4_10_PAYOUT_DEN')) {
      const denMatch = line.match(/=\s*(\d+)/);
      if (denMatch) payouts.place4_10Den = denMatch[1];
    }
    if (line.includes('PLACE_5_9_PAYOUT_NUM')) {
      const numMatch = line.match(/=\s*(\d+)/);
      if (numMatch) payouts.place5_9Num = numMatch[1];
    }
    if (line.includes('PLACE_5_9_PAYOUT_DEN')) {
      const denMatch = line.match(/=\s*(\d+)/);
      if (denMatch) payouts.place5_9Den = denMatch[1];
    }
    if (line.includes('PLACE_6_8_PAYOUT_NUM')) {
      const numMatch = line.match(/=\s*(\d+)/);
      if (numMatch) payouts.place6_8Num = numMatch[1];
    }
    if (line.includes('PLACE_6_8_PAYOUT_DEN')) {
      const denMatch = line.match(/=\s*(\d+)/);
      if (denMatch) payouts.place6_8Den = denMatch[1];
    }

    // True odds
    if (line.includes('TRUE_ODDS_4_10_NUM')) {
      const numMatch = line.match(/=\s*(\d+)/);
      if (numMatch) payouts.trueOdds4_10Num = numMatch[1];
    }
    if (line.includes('TRUE_ODDS_4_10_DEN')) {
      const denMatch = line.match(/=\s*(\d+)/);
      if (denMatch) payouts.trueOdds4_10Den = denMatch[1];
    }
    if (line.includes('TRUE_ODDS_5_9_NUM')) {
      const numMatch = line.match(/=\s*(\d+)/);
      if (numMatch) payouts.trueOdds5_9Num = numMatch[1];
    }
    if (line.includes('TRUE_ODDS_5_9_DEN')) {
      const denMatch = line.match(/=\s*(\d+)/);
      if (denMatch) payouts.trueOdds5_9Den = denMatch[1];
    }
    if (line.includes('TRUE_ODDS_6_8_NUM')) {
      const numMatch = line.match(/=\s*(\d+)/);
      if (numMatch) payouts.trueOdds6_8Num = numMatch[1];
    }
    if (line.includes('TRUE_ODDS_6_8_DEN')) {
      const denMatch = line.match(/=\s*(\d+)/);
      if (denMatch) payouts.trueOdds6_8Den = denMatch[1];
    }

    // Hardways
    if (line.includes('HARD_4_10_PAYOUT_NUM')) {
      const numMatch = line.match(/=\s*(\d+)/);
      if (numMatch) payouts.hard4_10Num = numMatch[1];
    }
    if (line.includes('HARD_4_10_PAYOUT_DEN')) {
      const denMatch = line.match(/=\s*(\d+)/);
      if (denMatch) payouts.hard4_10Den = denMatch[1];
    }
    if (line.includes('HARD_6_8_PAYOUT_NUM')) {
      const numMatch = line.match(/=\s*(\d+)/);
      if (numMatch) payouts.hard6_8Num = numMatch[1];
    }
    if (line.includes('HARD_6_8_PAYOUT_DEN')) {
      const denMatch = line.match(/=\s*(\d+)/);
      if (denMatch) payouts.hard6_8Den = denMatch[1];
    }
  }

  return payouts;
}

/**
 * Generate TypeScript constants file
 * @param {Object} payouts - Payout constants
 * @returns {string} TypeScript source code
 */
function generateTypeScriptConstants(payouts) {
  const timestamp = new Date().toISOString();

  return `// This file is auto-generated by scripts/sync-constants.js
// DO NOT EDIT MANUALLY - changes will be overwritten
// Generated at: ${timestamp}

/**
 * Craps payout constants synced from Rust (api/src/consts.rs)
 */

export const CRAPS_PAYOUTS = {
  passLine: { num: ${payouts.passLineNum}, den: ${payouts.passLineDen} },
  dontPass: { num: ${payouts.passLineNum}, den: ${payouts.passLineDen} },
  field: {
    normal: { num: ${payouts.fieldNormalNum}, den: ${payouts.fieldNormalDen} },
    special: { num: ${payouts.field2_12Num}, den: ${payouts.field2_12Den} }
  },
  anySeven: { num: ${payouts.anySevenNum}, den: ${payouts.anySevenDen} },
  anyCraps: { num: ${payouts.anyCrapsNum}, den: ${payouts.anyCrapsDen} },
  yoEleven: { num: ${payouts.yoElevenNum}, den: ${payouts.yoElevenDen} },
  aces: { num: ${payouts.acesNum}, den: ${payouts.acesDen} },
  twelve: { num: ${payouts.twelveNum}, den: ${payouts.twelveDen} },
  place4_10: { num: ${payouts.place4_10Num}, den: ${payouts.place4_10Den} },
  place5_9: { num: ${payouts.place5_9Num}, den: ${payouts.place5_9Den} },
  place6_8: { num: ${payouts.place6_8Num}, den: ${payouts.place6_8Den} },
  trueOdds4_10: { num: ${payouts.trueOdds4_10Num}, den: ${payouts.trueOdds4_10Den} },
  trueOdds5_9: { num: ${payouts.trueOdds5_9Num}, den: ${payouts.trueOdds5_9Den} },
  trueOdds6_8: { num: ${payouts.trueOdds6_8Num}, den: ${payouts.trueOdds6_8Den} },
  hard4_10: { num: ${payouts.hard4_10Num}, den: ${payouts.hard4_10Den} },
  hard6_8: { num: ${payouts.hard6_8Num}, den: ${payouts.hard6_8Den} },
} as const;

export type PayoutRatio = { num: number; den: number };
`;
}

/**
 * Main function
 */
function main() {
  console.log('Syncing constants from Rust to TypeScript...');

  // Read Rust source
  console.log(`Reading ${RUST_CONSTS_PATH}...`);
  const rustSource = fs.readFileSync(RUST_CONSTS_PATH, 'utf8');

  // Extract constants
  console.log('Extracting payout constants...');
  const payouts = extractPayoutConstants(rustSource);

  // Verify we got all the constants
  const requiredKeys = [
    'passLineNum', 'passLineDen',
    'fieldNormalNum', 'fieldNormalDen', 'field2_12Num', 'field2_12Den',
    'anySevenNum', 'anySevenDen',
    'anyCrapsNum', 'anyCrapsDen',
    'yoElevenNum', 'yoElevenDen',
    'acesNum', 'acesDen',
    'twelveNum', 'twelveDen',
    'place4_10Num', 'place4_10Den',
    'place5_9Num', 'place5_9Den',
    'place6_8Num', 'place6_8Den',
    'trueOdds4_10Num', 'trueOdds4_10Den',
    'trueOdds5_9Num', 'trueOdds5_9Den',
    'trueOdds6_8Num', 'trueOdds6_8Den',
    'hard4_10Num', 'hard4_10Den',
    'hard6_8Num', 'hard6_8Den',
  ];

  const missingKeys = requiredKeys.filter(key => !payouts[key]);
  if (missingKeys.length > 0) {
    console.error('ERROR: Missing required constants:', missingKeys);
    process.exit(1);
  }

  // Generate TypeScript
  console.log('Generating TypeScript constants...');
  const tsSource = generateTypeScriptConstants(payouts);

  // Ensure output directory exists
  const outputDir = path.dirname(TS_OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write output
  console.log(`Writing ${TS_OUTPUT_PATH}...`);
  fs.writeFileSync(TS_OUTPUT_PATH, tsSource, 'utf8');

  console.log('');
  console.log('Constants synced successfully!');
  console.log(`  ${requiredKeys.length / 2} payout types exported`);
}

// Run main function
if (require.main === module) {
  main();
}
