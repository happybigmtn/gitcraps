// Dice probability and payout calculations

// Core dice constants
export const DICE_FACES = 6;
export const BOARD_SIZE = DICE_FACES * DICE_FACES;
export const MIN_SUM = 2;
export const MAX_SUM = 12;

/**
 * Converts a board square (0-35) to dice values [die1, die2]
 */
export function squareToDice(square: number): [number, number] {
  return [Math.floor(square / DICE_FACES) + 1, (square % DICE_FACES) + 1];
}

/**
 * Converts a board square (0-35) to dice sum (2-12)
 */
export function squareToSum(square: number): number {
  const [d1, d2] = squareToDice(square);
  return d1 + d2;
}

/**
 * Converts dice values [die1, die2] to a board square (0-35)
 */
export function diceToSquare(die1: number, die2: number): number {
  return (die1 - 1) * DICE_FACES + (die2 - 1);
}

/**
 * Checks if dice roll is a "hard" way (doubles like 2-2, 3-3, etc)
 */
export function isHardway(die1: number, die2: number): boolean {
  return die1 === die2;
}

export interface DiceMultiplier {
  sum: number;
  probability: number;
  multiplier: number;
  ways: number;
  riskLevel: "none" | "low" | "medium" | "high" | "extreme";
}

// Probability distribution for two six-sided dice
export const DICE_MULTIPLIERS: DiceMultiplier[] = [
  { sum: 0, probability: 1, multiplier: 1 / 6, ways: 36, riskLevel: "none" }, // Safe mode
  { sum: 2, probability: 1 / 36, multiplier: 36, ways: 1, riskLevel: "extreme" },
  { sum: 3, probability: 2 / 36, multiplier: 18, ways: 2, riskLevel: "high" },
  { sum: 4, probability: 3 / 36, multiplier: 12, ways: 3, riskLevel: "high" },
  { sum: 5, probability: 4 / 36, multiplier: 9, ways: 4, riskLevel: "medium" },
  { sum: 6, probability: 5 / 36, multiplier: 7.2, ways: 5, riskLevel: "medium" },
  { sum: 7, probability: 6 / 36, multiplier: 6, ways: 6, riskLevel: "low" },
  { sum: 8, probability: 5 / 36, multiplier: 7.2, ways: 5, riskLevel: "medium" },
  { sum: 9, probability: 4 / 36, multiplier: 9, ways: 4, riskLevel: "medium" },
  { sum: 10, probability: 3 / 36, multiplier: 12, ways: 3, riskLevel: "high" },
  { sum: 11, probability: 2 / 36, multiplier: 18, ways: 2, riskLevel: "high" },
  { sum: 12, probability: 1 / 36, multiplier: 36, ways: 1, riskLevel: "extreme" },
];

export function getDiceMultiplier(prediction: number): DiceMultiplier | undefined {
  return DICE_MULTIPLIERS.find((d) => d.sum === prediction);
}

export function calculatePotentialReward(
  prediction: number,
  baseReward: number
): number {
  const multiplier = getDiceMultiplier(prediction);
  if (!multiplier) return 0;
  return baseReward * multiplier.multiplier;
}

export function formatMultiplier(prediction: number): string {
  const mult = getDiceMultiplier(prediction);
  if (!mult) return "0x";
  if (prediction === 0) return "1/6x";
  return `${mult.multiplier}x`;
}

export function formatProbability(prediction: number): string {
  const mult = getDiceMultiplier(prediction);
  if (!mult) return "0%";
  if (prediction === 0) return "100%";
  return `${(mult.probability * 100).toFixed(2)}%`;
}

export function formatWaysToRoll(prediction: number): string {
  const mult = getDiceMultiplier(prediction);
  if (!mult) return "";
  if (prediction === 0) return "Always wins";
  return `${mult.ways}/36 ways`;
}

export function getRiskColor(riskLevel: DiceMultiplier["riskLevel"]): string {
  switch (riskLevel) {
    case "none":
      return "text-blue-500";
    case "low":
      return "text-green-500";
    case "medium":
      return "text-yellow-500";
    case "high":
      return "text-orange-500";
    case "extreme":
      return "text-red-500";
    default:
      return "text-gray-500";
  }
}

export function getRiskBgColor(riskLevel: DiceMultiplier["riskLevel"]): string {
  switch (riskLevel) {
    case "none":
      return "bg-blue-500/20 border-blue-500/50";
    case "low":
      return "bg-green-500/20 border-green-500/50";
    case "medium":
      return "bg-yellow-500/20 border-yellow-500/50";
    case "high":
      return "bg-orange-500/20 border-orange-500/50";
    case "extreme":
      return "bg-red-500/20 border-red-500/50";
    default:
      return "bg-gray-500/20 border-gray-500/50";
  }
}

// Dice face patterns (positions of dots on 3x3 grid)
// Grid positions: 0-8 (top-left to bottom-right)
export const DICE_FACE_PATTERNS: Record<number, number[]> = {
  1: [4], // center
  2: [0, 8], // top-left, bottom-right
  3: [0, 4, 8], // diagonal
  4: [0, 2, 6, 8], // corners
  5: [0, 2, 4, 6, 8], // corners + center
  6: [0, 2, 3, 5, 6, 8], // two columns
};

// All 36 dice combinations in a 6x6 grid layout
// Index = (die1 - 1) * 6 + (die2 - 1)
export interface DiceCombination {
  index: number;
  die1: number;
  die2: number;
  sum: number;
  label: string;
}

// Generate all 36 combinations
export const ALL_DICE_COMBINATIONS: DiceCombination[] = [];
for (let die1 = 1; die1 <= 6; die1++) {
  for (let die2 = 1; die2 <= 6; die2++) {
    const index = (die1 - 1) * 6 + (die2 - 1);
    ALL_DICE_COMBINATIONS.push({
      index,
      die1,
      die2,
      sum: die1 + die2,
      label: `${die1}-${die2}`,
    });
  }
}

// Get indices of combinations that match a sum
export function getIndicesForSum(sum: number): number[] {
  return ALL_DICE_COMBINATIONS
    .filter((combo) => combo.sum === sum)
    .map((combo) => combo.index);
}

// Get combination by index
export function getCombinationByIndex(index: number): DiceCombination | undefined {
  return ALL_DICE_COMBINATIONS[index];
}

// Get all possible combinations for a sum
export function getCombinationsForSum(sum: number): [number, number][] {
  const combinations: [number, number][] = [];
  for (let die1 = 1; die1 <= 6; die1++) {
    const die2 = sum - die1;
    if (die2 >= 1 && die2 <= 6) {
      combinations.push([die1, die2]);
    }
  }
  return combinations;
}

// Prediction labels
export function getPredictionLabel(prediction: number): string {
  if (prediction === 0) return "SAFE MODE";
  if (prediction === 7) return "Lucky Seven";
  if (prediction === 2 || prediction === 12) return "Snake Eyes / Boxcars";
  return `Sum of ${prediction}`;
}

// Get sum color based on probability
export function getSumColor(sum: number): string {
  switch (sum) {
    case 7:
      return "text-green-500";
    case 6:
    case 8:
      return "text-yellow-500";
    case 5:
    case 9:
      return "text-yellow-500";
    case 4:
    case 10:
      return "text-orange-500";
    case 3:
    case 11:
      return "text-orange-500";
    case 2:
    case 12:
      return "text-red-500";
    default:
      return "text-gray-500";
  }
}

// Get background color for selected sum
export function getSumBgColor(sum: number): string {
  switch (sum) {
    case 7:
      return "bg-green-500/30 border-green-500";
    case 6:
    case 8:
      return "bg-yellow-500/30 border-yellow-500";
    case 5:
    case 9:
      return "bg-yellow-500/25 border-yellow-400";
    case 4:
    case 10:
      return "bg-orange-500/30 border-orange-500";
    case 3:
    case 11:
      return "bg-orange-500/25 border-orange-400";
    case 2:
    case 12:
      return "bg-red-500/30 border-red-500";
    default:
      return "bg-gray-500/20 border-gray-500";
  }
}
