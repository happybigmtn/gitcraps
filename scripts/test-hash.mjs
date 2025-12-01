import pkg from "js-sha3";
const { keccak256 } = pkg;

// The slot_hash that was in round-0-with-entropy
const slotHashHex = "35f53d7ddc362a202fe872d8c6519e73aae09aed85dffbd75c4d79ff8b3a0603";
const slotHashBytes = Buffer.from(slotHashHex, "hex");

const BOARD_SIZE = 36n;
const U64_MAX = 0xFFFFFFFFFFFFFFFFn;

function calculateWinningSquare(slotHashBytes) {
  const hashHex = keccak256(slotHashBytes);
  const hashBytes = Buffer.from(hashHex, "hex");
  const sample = hashBytes.readBigUInt64LE(0);

  console.log("Slot hash:", slotHashBytes.toString("hex"));
  console.log("Keccak hash:", hashHex);
  console.log("Sample (first 8 bytes LE):", sample.toString());

  const maxValid = (U64_MAX / BOARD_SIZE) * BOARD_SIZE;
  console.log("maxValid:", maxValid.toString());

  if (sample < maxValid) {
    const winningSquare = Number(sample % BOARD_SIZE);
    console.log("Using primary sample, winning_square:", winningSquare);
    return winningSquare;
  } else {
    console.log("Sample >= maxValid, using secondary hash");
    const hash2Hex = keccak256(hashBytes);
    const hash2Bytes = Buffer.from(hash2Hex, "hex");
    const sample2 = hash2Bytes.readBigUInt64LE(0);
    const winningSquare = Number(sample2 % BOARD_SIZE);
    console.log("Secondary sample:", sample2.toString());
    console.log("Using secondary sample, winning_square:", winningSquare);
    return winningSquare;
  }
}

const result = calculateWinningSquare(slotHashBytes);
console.log("\nFinal winning_square:", result);
console.log("Expected from on-chain error message: 27");
