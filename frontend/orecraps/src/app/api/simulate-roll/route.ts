import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/apiErrorHandler";
import { createDebugger } from "@/lib/debug";
import { diceToSquare } from "@/lib/dice";
import { validateLocalnetOnly } from "@/lib/middleware";

const debug = createDebugger("SimulateRoll");

/**
 * Simulate a dice roll for localnet testing.
 * This bypasses the on-chain entropy requirement.
 *
 * The dice grid maps to squares 0-35:
 * - Square = (die1 - 1) * 6 + (die2 - 1)
 * - Example: dice (1,1) = square 0, dice (6,6) = square 35
 */
export async function POST(request: Request) {
  try {
    const localnetError = validateLocalnetOnly();
    if (localnetError) return localnetError;

    const body = await request.json().catch(() => ({}));

    // Generate random dice roll using crypto for proper randomness
    const randomBytes = new Uint32Array(2);
    crypto.getRandomValues(randomBytes);
    const die1 = (randomBytes[0] % 6) + 1;
    const die2 = (randomBytes[1] % 6) + 1;
    const diceSum = die1 + die2;
    const winningSquare = diceToSquare(die1, die2);

    // Check if it's a hardway (doubles like 2+2, 3+3, etc.)
    const isHardway = die1 === die2 && [2, 3, 4, 5].includes(die1);

    debug(`Simulated roll: ${die1} + ${die2} = ${diceSum}`);
    debug(`Winning square: ${winningSquare}, isHardway: ${isHardway}`);

    // Determine bet outcomes based on craps rules
    const outcomes: Record<string, { wins: boolean; reason: string }> = {};

    // Single-roll bets
    outcomes.field = {
      wins: [2, 3, 4, 9, 10, 11, 12].includes(diceSum),
      reason: diceSum === 2 || diceSum === 12
        ? `Field wins 2:1 on ${diceSum}!`
        : [3, 4, 9, 10, 11].includes(diceSum)
          ? `Field wins 1:1 on ${diceSum}`
          : `Field loses on ${diceSum}`,
    };

    outcomes.anySeven = {
      wins: diceSum === 7,
      reason: diceSum === 7 ? "Any Seven wins 4:1!" : `Any Seven loses on ${diceSum}`,
    };

    outcomes.anyCraps = {
      wins: [2, 3, 12].includes(diceSum),
      reason: [2, 3, 12].includes(diceSum)
        ? `Any Craps wins 7:1 on ${diceSum}!`
        : `Any Craps loses on ${diceSum}`,
    };

    outcomes.yoEleven = {
      wins: diceSum === 11,
      reason: diceSum === 11 ? "Yo Eleven wins 15:1!" : `Yo loses on ${diceSum}`,
    };

    outcomes.aces = {
      wins: diceSum === 2,
      reason: diceSum === 2 ? "Aces (Snake Eyes) wins 30:1!" : `Aces loses on ${diceSum}`,
    };

    outcomes.twelve = {
      wins: diceSum === 12,
      reason: diceSum === 12 ? "Twelve (Boxcars) wins 30:1!" : `Twelve loses on ${diceSum}`,
    };

    // Come-out roll rules for Pass/Don't Pass
    const isNatural = diceSum === 7 || diceSum === 11;
    const isCraps = [2, 3, 12].includes(diceSum);
    const isPoint = [4, 5, 6, 8, 9, 10].includes(diceSum);

    outcomes.passLine = {
      wins: isNatural,
      reason: isNatural
        ? `Pass Line wins on ${diceSum}!`
        : isCraps
          ? `Pass Line loses on ${diceSum}`
          : `Point established: ${diceSum}`,
    };

    outcomes.dontPass = {
      wins: diceSum === 2 || diceSum === 3,
      reason: diceSum === 12
        ? "Don't Pass pushes on 12"
        : (diceSum === 2 || diceSum === 3)
          ? `Don't Pass wins on ${diceSum}!`
          : isNatural
            ? `Don't Pass loses on ${diceSum}`
            : `Point established: ${diceSum}`,
    };

    // Hardway bets (only resolve on 7 or if number hits)
    for (const hardNum of [4, 6, 8, 10]) {
      const key = `hard${hardNum}`;
      if (diceSum === hardNum && die1 === die2) {
        outcomes[key] = {
          wins: true,
          reason: `Hard ${hardNum} wins ${hardNum === 4 || hardNum === 10 ? '7:1' : '9:1'}!`
        };
      } else if (diceSum === 7 || (diceSum === hardNum && die1 !== die2)) {
        outcomes[key] = {
          wins: false,
          reason: diceSum === 7
            ? `Hard ${hardNum} loses on 7`
            : `Hard ${hardNum} loses on easy ${hardNum}`
        };
      } else {
        outcomes[key] = {
          wins: false,
          reason: `Hard ${hardNum} still active (no decision on ${diceSum})`
        };
      }
    }

    // Place bets (win on number, lose on 7)
    for (const placeNum of [4, 5, 6, 8, 9, 10]) {
      const key = `place${placeNum}`;
      if (diceSum === placeNum) {
        outcomes[key] = { wins: true, reason: `Place ${placeNum} wins!` };
      } else if (diceSum === 7) {
        outcomes[key] = { wins: false, reason: `Place ${placeNum} loses on 7` };
      } else {
        outcomes[key] = {
          wins: false,
          reason: `Place ${placeNum} still active (rolled ${diceSum})`
        };
      }
    }

    return NextResponse.json({
      success: true,
      simulated: true,
      diceResults: {
        die1,
        die2,
        sum: diceSum,
        isHardway,
      },
      winningSquare,
      outcomes,
      message: `Simulated roll: ${die1} + ${die2} = ${diceSum}`,
    });
  } catch (error) {
    debug("Error:", error);
    return handleApiError(error);
  }
}
