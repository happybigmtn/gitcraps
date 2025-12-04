# Casino War Frontend Integration - Remaining Steps

All Casino War frontend files have been created following the existing Roulette patterns. Here's what needs to be done to complete the integration:

## 1. Add War Types to program.ts

The War types, PDAs, instructions, parsers, and helpers need to be added to `/home/r/Coding/ore/frontend/orecraps/src/lib/program.ts`.

**Location:** Insert right before the "RE-EXPORTS" section (around line 2931)

**Steps:**

### 1a. Update the ROUL_MINT import (around line 2479):
```typescript
import { ROUL_MINT, WAR_MINT } from "./solana";
```

### 1b. Add War instruction discriminators (already added at lines 82-88):
The discriminators 48-53 have been added to the OreInstruction enum.

### 1c. Insert the complete War section before RE-EXPORTS:

See the full War types, PDAs, instructions, parsers, and helpers code below in Section 5 "Complete War Code for program.ts"

### 1d. Update the re-exports line:
```typescript
export { ORE_PROGRAM_ADDRESS, RNG_MINT_ADDRESS, CRAP_MINT_ADDRESS, CARAT_MINT_ADDRESS, ROUL_MINT_ADDRESS, WAR_MINT_ADDRESS } from "./solana";
```

## 2. Add War Transaction Methods to transactionService.ts

Add these methods to `/home/r/Coding/ore/frontend/orecraps/src/services/transactionService.ts`:

```typescript
// Place War Bet
async placeWarBet(
  wallet: WalletContextState,
  connection: Connection,
  anteBet: number,
  tieBet: number
): Promise<TransactionResult> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    return { success: false, error: "Wallet not connected" };
  }

  try {
    const anteAmount = BigInt(Math.floor(anteBet * Number(ONE_WAR)));
    const tieAmount = BigInt(Math.floor(tieBet * Number(ONE_WAR)));

    const ix = createPlaceWarBetInstruction(
      wallet.publicKey,
      anteAmount,
      tieAmount
    );

    const signature = await this.sendAndConfirmTransaction(
      connection,
      [ix],
      wallet
    );

    return { success: true, signature };
  } catch (error) {
    console.error("Place war bet error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Deal War
async dealWar(
  wallet: WalletContextState,
  connection: Connection
): Promise<TransactionResult> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    return { success: false, error: "Wallet not connected" };
  }

  try {
    const slotHash = await this.getRecentSlotHash(connection);
    const ix = createDealWarInstruction(wallet.publicKey, slotHash);

    const signature = await this.sendAndConfirmTransaction(
      connection,
      [ix],
      wallet
    );

    return { success: true, signature };
  } catch (error) {
    console.error("Deal war error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Go To War
async goToWar(
  wallet: WalletContextState,
  connection: Connection
): Promise<TransactionResult> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    return { success: false, error: "Wallet not connected" };
  }

  try {
    const slotHash = await this.getRecentSlotHash(connection);
    const ix = createGoToWarInstruction(wallet.publicKey, slotHash);

    const signature = await this.sendAndConfirmTransaction(
      connection,
      [ix],
      wallet
    );

    return { success: true, signature };
  } catch (error) {
    console.error("Go to war error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Surrender
async surrender(
  wallet: WalletContextState,
  connection: Connection
): Promise<TransactionResult> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    return { success: false, error: "Wallet not connected" };
  }

  try {
    const ix = createSurrenderInstruction(wallet.publicKey);

    const signature = await this.sendAndConfirmTransaction(
      connection,
      [ix],
      wallet
    );

    return { success: true, signature };
  } catch (error) {
    console.error("Surrender error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Claim War Winnings
async claimWarWinnings(
  wallet: WalletContextState,
  connection: Connection
): Promise<TransactionResult> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    return { success: false, error: "Wallet not connected" };
  }

  try {
    const ix = createClaimWarWinningsInstruction(wallet.publicKey);

    const signature = await this.sendAndConfirmTransaction(
      connection,
      [ix],
      wallet
    );

    return { success: true, signature };
  } catch (error) {
    console.error("Claim war winnings error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
```

Don't forget to add the imports at the top:
```typescript
import {
  // ... existing imports
  createPlaceWarBetInstruction,
  createDealWarInstruction,
  createGoToWarInstruction,
  createSurrenderInstruction,
  createClaimWarWinningsInstruction,
} from "@/lib/program";
import { ONE_WAR } from "@/lib/solana";
```

## 3. Add getWarMint helper to solana.ts (if not exists)

Check if `/home/r/Coding/ore/frontend/orecraps/src/lib/solana.ts` has a `getWarMint` function. If not, add it following the pattern of `getRoulMint`:

```typescript
function getWarMint(network?: Network): PublicKey {
  const net = network || getNetworkFromEnv();
  return new PublicKey(net === "devnet" ? DEVNET_WAR_MINT : LOCALNET_WAR_MINT);
}

export { getWarMint };
```

## 4. Verify WAR_MINT_ADDRESS export

Check that `/home/r/Coding/ore/frontend/orecraps/src/lib/solana.ts` exports `WAR_MINT_ADDRESS` as a Kit Address type (it should already exist based on the grep results).

## Files Created

All frontend files have been created:

### Store
- ✅ `/home/r/Coding/ore/frontend/orecraps/src/store/warStore.ts`

### Hooks
- ✅ `/home/r/Coding/ore/frontend/orecraps/src/hooks/useWar.ts`

### Components
- ✅ `/home/r/Coding/ore/frontend/orecraps/src/components/war/WarLayout.tsx`
- ✅ `/home/r/Coding/ore/frontend/orecraps/src/components/war/WarTable.tsx`
- ✅ `/home/r/Coding/ore/frontend/orecraps/src/components/war/WarBettingPanel.tsx`
- ✅ `/home/r/Coding/ore/frontend/orecraps/src/components/war/WarGameStatus.tsx`
- ✅ `/home/r/Coding/ore/frontend/orecraps/src/components/war/index.ts`

## Usage

After completing steps 1-4, you can use the War game in your app by importing:

```typescript
import { WarLayout } from "@/components/war";
```

The WarLayout component provides the complete UI for:
- Viewing the war table with card displays
- Placing ante and tie bets
- Dealing cards
- Going to war or surrendering on ties
- Claiming winnings
- Viewing game status and statistics

## Testing

1. Ensure WAR tokens are minted and available on your test network
2. Fund the house bankroll with `FundWarHouse` instruction
3. Players need WAR tokens to place bets
4. Test the complete flow:
   - Place ante bet (with optional tie bet)
   - Deal cards
   - If tie: choose to go to war or surrender
   - Claim winnings

## Notes

- All code follows the existing Roulette patterns
- Uses Zustand for state management
- Uses TransactionService for all blockchain interactions
- Integrates with existing wallet adapter
- Supports both localnet and devnet
- No build/compilation was run - you should run `npm run build` to verify TypeScript compilation
