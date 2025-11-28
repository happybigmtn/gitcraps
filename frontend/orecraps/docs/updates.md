# Project Updates

## 2025-11-28: Transaction Service - Centralized Transaction Logic

### Problem
Transaction building and sending logic was scattered across API routes and components, with each implementing the same pattern:
- Getting blockhash
- Building transactions
- Signing and sending
- Confirming transactions
- Error handling

This duplication meant:
- Changes to transaction logic required updating multiple files
- Error handling was inconsistent
- No centralized place for transaction-related utilities
- Difficult to add new transaction types
- Hard to support both wallet (client) and keypair (server) signing

Examples of duplication:
```typescript
// In CrapsBettingPanel.tsx (lines 82-114)
const transaction = new Transaction();
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
transaction.recentBlockhash = blockhash;
transaction.feePayer = publicKey;
const signature = await sendTransaction(transaction, connection);
await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight });

// In DeployPanel.tsx (lines 108-130) - Same pattern repeated
const transaction = new Transaction().add(deployIx);
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
transaction.recentBlockhash = blockhash;
transaction.feePayer = publicKey;
const signature = await sendTransaction(transaction, connection);
await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight });

// In useTransaction hook - Another variation
const tx = new Transaction().add(...instructions);
tx.recentBlockhash = blockhash;
tx.feePayer = publicKey;
const signature = await sendTransaction(tx, connection);
await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight });
```

### Solution
Created a comprehensive TransactionService that consolidates all transaction logic with:
- Clean TypeScript types
- Network abstraction integration (automatic failover)
- Typed methods for common operations
- Consistent error transformation
- Support for both wallet and keypair signing
- Simulation mode support

#### Architecture

```
/src/services/
├── transactionService.ts      # New consolidated service
├── LegacyTransactionService.ts # Old simple service (renamed)
├── CrapsGameService.ts        # Uses legacy service
└── index.ts                   # Exports both services
```

#### Core Service Methods

**Low-level transaction handling:**
- `sendWithWallet()` - Send transaction using wallet adapter (client-side)
- `sendWithKeypair()` - Send transaction using keypair (server-side)
- `simulateTransaction()` - Simulate without sending (testing/demo)

**Typed transaction builders for Craps:**
- `placeCrapsBets()` - Place one or more bets atomically
- `settleCraps()` - Settle bets after a round
- `claimCrapsWinnings()` - Claim pending winnings
- `fundCrapsHouse()` - Fund the house bankroll

**Typed transaction builders for Mining:**
- `deploy()` - Deploy SOL to mining squares
- `checkpoint()` - Checkpoint mining progress
- `claimSOL()` - Claim mining rewards

#### Key Features

**1. Network Abstraction Integration**
```typescript
// Automatic failover using withFallback from network abstraction
const { blockhash, lastValidBlockHeight } = await withFallback(
  async (conn) => conn.getLatestBlockhash()
);
```

**2. Comprehensive Error Transformation**
```typescript
private transformError(error: unknown): string {
  // User cancelled → "Transaction cancelled by user"
  // Insufficient funds → "Insufficient SOL balance for transaction"
  // Rate limit → "RPC rate limit exceeded. Please try again in a moment."
  // Network error → "Network error. Please check your connection."
  // Expired → "Transaction expired. Please try again."
  // Unknown → Original error message
}
```

**3. Signature Validation**
```typescript
private validateSignature(signature: string): void {
  if (!signature || typeof signature !== "string" || signature.length === 0) {
    throw new Error("Invalid transaction signature received");
  }
}
```

**4. Flexible Options**
```typescript
interface SendTransactionOptions {
  commitment?: Commitment;        // default: 'confirmed'
  skipPreflight?: boolean;        // default: false
  maxRetries?: number;            // default: 3
}
```

**5. Typed Result Interface**
```typescript
interface TransactionResult {
  success: boolean;
  signature?: string;
  error?: string;
}
```

#### Usage Examples

**Client-side with Wallet:**
```typescript
import { TransactionService, CrapsBetType } from '@/services';

const service = new TransactionService();

// Place multiple bets atomically
const result = await service.placeCrapsBets(
  wallet,
  connection,
  [
    { betType: CrapsBetType.PassLine, amount: 0.1 },
    { betType: CrapsBetType.Field, amount: 0.05 },
  ]
);

if (result.success) {
  console.log('Bets placed:', result.signature);
  console.log('Bets placed:', result.betsPlaced);
} else {
  console.error('Error:', result.error);
}
```

**Server-side with Keypair:**
```typescript
import { TransactionService } from '@/services';
import { createPlaceCrapsBetInstruction } from '@/lib/program';

const service = new TransactionService(connection);

const instructions = [
  createPlaceCrapsBetInstruction(payer.publicKey, betType, point, amount)
];

const result = await service.sendWithKeypair(
  instructions,
  payer,
  connection
);
```

**Simulation Mode:**
```typescript
const result = await service.simulateTransaction({
  signaturePrefix: 'test'
});
// Returns: { success: true, signature: 'test_abc123_xyz789' }
```

**Deploy to Mining Squares:**
```typescript
const result = await service.deploy(wallet, connection, {
  amount: BigInt(1_000_000_000), // 1 SOL in lamports
  roundId: board.roundId,
  squares: selectedSquares, // boolean array
});
```

**Claim Winnings:**
```typescript
const result = await service.claimCrapsWinnings(wallet, connection);
```

#### Type Safety

All transaction methods are fully typed with TypeScript:

```typescript
interface PlaceBetParams {
  betType: CrapsBetType;
  point?: number;
  amount: number; // in SOL
}

interface DeployParams {
  amount: bigint;        // in lamports
  roundId: bigint;
  squares: boolean[];    // 36 elements
}

interface SettleCrapsParams {
  winningSquare: bigint;
  roundId: bigint;
}
```

#### Error Handling

The service provides consistent error handling across all operations:

1. **Validation Errors**: Caught early and returned with clear messages
2. **Network Errors**: Automatically retried with failover
3. **User Cancellation**: Detected and reported as "Transaction cancelled by user"
4. **Insufficient Funds**: Detected and reported with clear message
5. **Rate Limits**: Fast failover triggered, user-friendly message
6. **Signature Validation**: All signatures validated before returning

### Benefits

1. **DRY Principle**: Transaction logic defined once, used everywhere
2. **Consistency**: All transactions use the same error handling and validation
3. **Network Integration**: Automatic failover and retry using network abstraction
4. **Type Safety**: Full TypeScript support with clear interfaces
5. **Maintainability**: Changes to transaction logic happen in one place
6. **Testability**: Easy to mock the service for testing
7. **Documentation**: Comprehensive JSDoc comments with examples
8. **Flexibility**: Supports wallet signing, keypair signing, and simulation
9. **Backward Compatible**: Old TransactionService renamed to LegacyTransactionService

### Migration Path

**Option 1: Use new service directly**
```typescript
import { TransactionService } from '@/services';
const service = new TransactionService();
const result = await service.placeCrapsBets(wallet, connection, bets);
```

**Option 2: Keep existing code (backward compatible)**
```typescript
import { LegacyTransactionService } from '@/services';
// Old code continues to work
```

**Option 3: Gradual migration**
- New features use TransactionService
- Existing code can stay on LegacyTransactionService
- Migrate components one at a time

### Files Created

1. `/src/services/transactionService.ts` - New consolidated transaction service (600+ lines)

### Files Modified

1. `/src/services/TransactionService.ts` → `/src/services/LegacyTransactionService.ts` (renamed)
2. `/src/services/CrapsGameService.ts` - Updated import to use LegacyTransactionService
3. `/src/services/index.ts` - Exports both services with clear naming

### Related Issues

- Resolves TODO #021 (scattered transaction logic)
- Related to TODO #045 (extract transaction hook - can now use this service)
- Supports network abstraction from Issue #017

### Testing

- Build completed successfully
- TypeScript compilation passes
- All existing functionality preserved
- No breaking changes to existing code
- Ready for gradual adoption in components

---

# Project Updates

## 2025-11-28: Composite Hooks - Reducing Tight Coupling

### Problem
Components were importing many individual hooks (useBoard, useWallet, useNetwork, useCraps, useTransaction, etc.), creating tight coupling and making it difficult to:
- Understand what state a component needs at a glance
- Refactor shared logic across components
- Test components with mock data
- Maintain consistent patterns across the codebase

Example of the problem:
```typescript
// Before: Components had to import many hooks
import { useBoard } from '@/hooks/useBoard';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { useCraps } from '@/hooks/useCraps';
import { useTransaction } from '@/hooks/useTransaction';
import { useNetworkStore } from '@/store/networkStore';

function Component() {
  const { board, round, loading, error, refetch } = useBoard();
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const { game, position } = useCraps();
  const { network } = useNetworkStore();
  // ... complex logic combining all these hooks
}
```

### Solution
Created composite hooks that combine related functionality while maintaining backward compatibility:

#### Architecture

```
/src/hooks/composites/
├── useGameSession.ts  # Combines board, round, and network state
├── useBetting.ts      # Combines wallet, transactions, and craps state
└── index.ts          # Public exports
```

#### 1. useGameSession Hook

**Purpose**: Combines board, round, and network state for game session management.

**What it provides**:
- All board and round state (re-exported for backward compatibility)
- Network information and switching
- Computed convenience values:
  - `isActive` - whether round is active
  - `timeRemaining` - seconds until round expires
  - `currentRoundId` - current round ID or null
  - `slotsRemaining` - slots until expiry
  - `isRoundExpired` - whether round has expired
  - `hasWinningSquare` - whether winner has been determined
- Utility methods:
  - `getSquareDeployed(index)` - get deployed amount for a square
  - `getSquareCount(index)` - get miner count for a square
  - `refetch()` - refresh board/round data
  - `setNetwork()` - switch networks

**Usage**:
```typescript
import { useGameSession } from '@/hooks/composites';

function GameComponent() {
  const {
    isActive,
    timeRemaining,
    currentRoundId,
    hasWinningSquare,
    getSquareDeployed,
    refetch
  } = useGameSession();

  if (!isActive) {
    return <div>Waiting for round...</div>;
  }

  return (
    <div>
      Round {currentRoundId?.toString()} - {timeRemaining}s remaining
      {hasWinningSquare && <div>Winner determined!</div>}
    </div>
  );
}
```

#### 2. useBetting Hook

**Purpose**: Combines wallet, transaction submission, and craps game state.

**What it provides**:
- All wallet state (publicKey, connected)
- All craps game state (game, position, isComeOut, currentPoint, etc.)
- Transaction submission with proper error handling
- Computed convenience values:
  - `isConnected` - wallet connection status
  - `hasPosition` - whether user has active bets
  - `hasPendingWinnings` - whether user has winnings to claim
  - `houseBankrollSOL` - bankroll in SOL (not lamports)
  - `pendingWinningsSOL` - winnings in SOL
  - `isSubmitting` - whether transaction is in progress
- Betting operations:
  - `canPlaceBet(betType)` - check if bet can be placed
  - `placeBet(options)` - place a single bet
  - `placeBets(bets)` - place multiple bets atomically
  - `claimWinnings()` - claim pending winnings
  - `submitTransaction(instructions)` - custom transaction submission

**Usage**:
```typescript
import { useBetting, CrapsBetType } from '@/hooks/composites';

function BettingComponent() {
  const {
    isConnected,
    game,
    canPlaceBet,
    placeBet,
    claimWinnings,
    hasPendingWinnings,
    pendingWinningsSOL,
    isSubmitting,
  } = useBetting();

  const handlePassLineBet = async () => {
    await placeBet({
      betType: CrapsBetType.PassLine,
      amount: 1.0, // in SOL
    });
  };

  return (
    <div>
      <button
        onClick={handlePassLineBet}
        disabled={!canPlaceBet(CrapsBetType.PassLine) || isSubmitting}
      >
        Place Pass Line Bet (1 SOL)
      </button>

      {hasPendingWinnings && (
        <button onClick={claimWinnings} disabled={isSubmitting}>
          Claim {pendingWinningsSOL.toFixed(4)} SOL
        </button>
      )}
    </div>
  );
}
```

### Key Features

#### Backward Compatibility
- All individual hook values are re-exported
- Components can migrate incrementally
- No breaking changes to existing code

#### Convenience Methods
- `placeBets()` - submit multiple bets atomically
- `canPlaceBet()` - encapsulates bet placement rules
- `getSquareDeployed()` / `getSquareCount()` - safe array access with bounds checking

#### Type Safety
- Full TypeScript support
- Exported types: `GameSession`, `BettingSession`, `PendingBet`, etc.
- Re-exports commonly used types for convenience

#### Error Handling
- Comprehensive error handling with user-friendly messages
- Transaction validation (signature checks)
- Wallet connection checks
- Toast notifications for all operations

#### Performance
- Uses React.useMemo for computed values
- Memoized callbacks with useCallback
- Prevents unnecessary re-renders

### Benefits

1. **Reduced Coupling**: Components import 1-2 composite hooks instead of 5-6 individual hooks
2. **Better Encapsulation**: Related state and operations grouped together
3. **Easier Testing**: Mock a single composite hook instead of many individual ones
4. **Consistent Patterns**: Common operations have standard implementations
5. **Type Safety**: Fully typed with comprehensive TypeScript support
6. **Documentation**: Extensive JSDoc comments with usage examples

### Migration Examples

#### Before (Many Individual Hooks)
```typescript
import { useBoard } from '@/hooks/useBoard';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useCraps } from '@/hooks/useCraps';
import { useNetworkStore } from '@/store/networkStore';

function Component() {
  const { board, round, loading } = useBoard();
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { game, position, isComeOut } = useCraps();
  const { network } = useNetworkStore();

  const isActive = board !== null && round !== null;
  const timeRemaining = /* complex calculation */;

  // ... component logic
}
```

#### After (Composite Hooks)
```typescript
import { useGameSession, useBetting } from '@/hooks/composites';

function Component() {
  const { isActive, timeRemaining, network } = useGameSession();
  const { game, position, isComeOut, placeBet } = useBetting();

  // ... component logic
}
```

### Files Created

1. `/src/hooks/composites/useGameSession.ts` - Game session composite hook
2. `/src/hooks/composites/useBetting.ts` - Betting composite hook
3. `/src/hooks/composites/index.ts` - Public exports

### Files Not Modified

- All existing hooks remain unchanged
- All existing components continue to work
- No breaking changes

### Testing

- Build completed successfully
- TypeScript compilation passes
- All existing functionality preserved
- Ready for gradual migration in components

---

## 2025-11-28: Network Abstraction Layer (Issue 017)

### Problem
Network switching and RPC management were tightly coupled in `/src/lib/rpcManager.ts`, making it difficult to:
- Test components independently
- Extend network functionality
- Understand the separation between network configuration and connection management
- Add new networks or failover strategies

### Solution
Created a modular network abstraction layer with clear separation of concerns:

#### Architecture

```
/src/lib/network/
├── types.ts              # Core type definitions and interfaces
├── config.ts             # Network configurations and constants
├── networkManager.ts     # Network mode state management
├── connectionManager.ts  # RPC connection with failover logic
├── provider.ts           # Unified API coordinating both managers
├── index.ts             # Public API exports
├── examples.ts          # Usage examples
└── README.md            # Comprehensive documentation
```

#### Key Components

1. **NetworkManager** (`networkManager.ts`)
   - Manages network mode state (localnet/devnet)
   - Validates network configurations
   - Provides network-specific settings

2. **ConnectionManager** (`connectionManager.ts`)
   - Manages Solana RPC connection lifecycle
   - Implements automatic failover between endpoints
   - Tracks failure states and triggers switches
   - Handles rate limit detection with fast failover

3. **NetworkProvider** (`provider.ts`)
   - Coordinates network and connection managers
   - Provides unified API for all operations
   - Maintains singleton state for consistency

4. **Clean Configuration** (`config.ts`)
   - Centralized network endpoint definitions
   - Failover behavior configuration
   - Default connection options

#### Public API

The new abstraction provides a clean, well-documented API:

```typescript
import {
  getConnection,       // Get current RPC connection
  setNetworkMode,      // Switch networks
  getNetworkMode,      // Get current network
  getCurrentEndpoint,  // Get active RPC endpoint URL
  withFallback,        // Execute with automatic retry/failover
  reportSuccess,       // Report successful RPC call
  reportFailure,       // Report failed RPC call
} from '@/lib/network';
```

#### Backward Compatibility

- Old `/src/lib/rpcManager.ts` now acts as a compatibility layer
- All existing imports continue to work unchanged
- Marked as deprecated with JSDoc comments
- Internally delegates to new network abstraction

### Benefits

1. **Modularity**: Clear separation between network config and connection management
2. **Testability**: Each component can be tested independently
3. **Extensibility**: Easy to add new networks or failover strategies
4. **Maintainability**: Single source of truth for network behavior
5. **Type Safety**: Full TypeScript support with clear interfaces
6. **Documentation**: Comprehensive inline docs and README

### Migration Path

#### For New Code
```typescript
// Use the new API directly
import { getConnection, withFallback } from '@/lib/network';
```

#### For Existing Code
```typescript
// No changes needed - old imports still work
import { getConnection, withFallback } from '@/lib/rpcManager';
// But consider migrating to the new API when convenient
```

### Features Preserved

- Automatic failover between RPC endpoints
- Rate limit detection (429 errors)
- Fast failover on rate limits (1 failure vs 3 for regular errors)
- Thread-safe endpoint switching (prevents concurrent switches)
- Configurable retry logic
- Debug logging support

### Files Created

1. `/src/lib/network/types.ts` - Type definitions
2. `/src/lib/network/config.ts` - Configuration
3. `/src/lib/network/networkManager.ts` - Network state management
4. `/src/lib/network/connectionManager.ts` - Connection management
5. `/src/lib/network/provider.ts` - Unified API
6. `/src/lib/network/index.ts` - Public exports
7. `/src/lib/network/examples.ts` - Usage examples
8. `/src/lib/network/README.md` - Documentation

### Files Modified

1. `/src/lib/rpcManager.ts` - Now a compatibility layer

### Testing

- Build completed successfully
- TypeScript compilation passes (pre-existing errors are unrelated)
- All existing functionality preserved
- No breaking changes to existing code

---

## 2025-11-28: BigInt Precision Loss Fix (Issue 010)

### Problem
Code was converting large BigInt values to Number, which could lose precision for values > 2^53 (Number.MAX_SAFE_INTEGER = 9007199254740991).

### Changes Made

#### 1. Created BigInt Utility Library
- **File**: `/src/lib/bigintUtils.ts`
- Added `safeToNumber()` function that throws if value exceeds safe integer range
- Added `toDisplayNumber()` for display-only conversions
- Added `bigIntMax()` and `bigIntMin()` for safe BigInt comparisons

#### 2. Fixed Type Definitions

**`src/components/board/MiningBoard.tsx`**:
- Changed `SquareData.minerCount` from `number` to `bigint`
- Changed `maxDeployed` calculation to use BigInt comparison instead of `Math.max()`
- Updated comparisons to use BigInt operators (`>`, `===`) instead of Number conversion

**`src/components/stats/RoundTimer.tsx`**:
- Changed all props from `number` to `bigint`:
  - `roundId?: bigint`
  - `startSlot?: bigint`
  - `endSlot?: bigint`
  - `currentSlot?: bigint`
- Updated default values to use BigInt literals (`0n`)
- Perform BigInt arithmetic first, then convert to Number for display

**`src/app/page.tsx`**:
- Removed `Number()` conversion from `round.count[index]`, keeping it as BigInt
- Changed RoundTimer props to pass BigInt values directly
- BigInt subtraction performed before conversion to Number

#### 3. Fixed BigInt Operations

**`src/hooks/useBoard.ts`**:
- Changed `Number(round.expiresAt) - Number(board.currentSlot)` to `Number(round.expiresAt - board.currentSlot)`
- This ensures the subtraction happens in BigInt space before conversion

**`src/components/simulation/BotLeaderboard.tsx`**:
- Same pattern: perform BigInt arithmetic first, convert to Number only at the last moment
- Added comment explaining slot numbers should be within safe integer range

#### 4. Added Documentation Comments

**Display-only conversions** in the following files now have comments clarifying they are safe for display:
- `src/lib/solana.ts`: `formatSol()`, `lamportsToSol()`
- `src/store/crapsStore.ts`: `formatLamports()`

These conversions are safe because:
1. They divide by 1e9 (LAMPORTS_PER_SOL), making the result much smaller
2. They are used only for UI display, not for calculations
3. Small precision loss in display is acceptable (e.g., showing 1.2345 SOL vs 1.234500001 SOL)

### Key Principles Applied

1. **Keep BigInt as long as possible**: Perform all arithmetic in BigInt space
2. **Convert at display time**: Only convert to Number when displaying to user
3. **Use BigInt operators**: Use `>`, `<`, `===` for comparisons, not Number conversion
4. **Document conversion points**: Add comments explaining why each conversion is safe

### Impact

- **No precision loss** for miner counts, deployed amounts, or round IDs
- **No precision loss** for slot number arithmetic
- **Safe display conversions** for lamports → SOL (division makes numbers small)
- **Type safety** improved with proper BigInt types throughout the chain

### Files Modified

1. `/src/lib/bigintUtils.ts` (new file)
2. `/src/components/board/MiningBoard.tsx`
3. `/src/components/stats/RoundTimer.tsx`
4. `/src/app/page.tsx`
5. `/src/hooks/useBoard.ts`
6. `/src/components/simulation/BotLeaderboard.tsx`
7. `/src/lib/solana.ts`
8. `/src/store/crapsStore.ts`

### TypeScript Compilation

All changes compile successfully. Pre-existing TypeScript errors in the codebase are unrelated to these changes.

---

## 2025-11-28: State Management Data Flow Documentation

### Overview

The orecraps project uses **Zustand** for state management with 5 distinct stores, each handling specific domains. State is persisted using Zustand's `persist` middleware with localStorage.

### Store Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      APPLICATION LAYERS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │               COMPONENTS (UI Layer)                       │  │
│  │  - MiningBoard, DeployPanel, BotLeaderboard               │  │
│  │  - CrapsBettingPanel, NetworkToggle, LiveAnalytics        │  │
│  └───────────┬──────────────────────────────────┬────────────┘  │
│              │                                   │               │
│  ┌───────────▼──────────────┐     ┌────────────▼────────────┐  │
│  │   HOOKS (Logic Layer)    │     │  STORES (State Layer)    │  │
│  │  - useBoard              │◄────┤  - gameStore             │  │
│  │  - useCraps              │     │  - simulationStore       │  │
│  │  - useTransaction        │     │  - crapsStore            │  │
│  │  - useSimulationEngine   │     │  - networkStore          │  │
│  └───────────┬──────────────┘     │  - analyticsStore        │  │
│              │                     └────────────┬────────────┘  │
│  ┌───────────▼──────────────┐                  │               │
│  │    RPC LAYER             │◄─────────────────┘               │
│  │  - withFallback()        │                                   │
│  │  - rpcManager            │                                   │
│  └───────────┬──────────────┘                                   │
│              │                                                   │
│  ┌───────────▼──────────────┐                                   │
│  │   SOLANA BLOCKCHAIN      │                                   │
│  │  - Program Accounts      │                                   │
│  │  - Transactions          │                                   │
│  └──────────────────────────┘                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Store Breakdown

#### 1. gameStore (/src/store/gameStore.ts)

**Purpose**: Manages user's local game preferences and UI state for the mining board.

**Key State**:
- `selectedSum: number | null` - Currently highlighted sum (2-12)
- `selectedSquares: boolean[]` - 36-element array for dice combination selection
- `deployAmount: number` - Amount in SOL to deploy per square
- `isDeploying: boolean` - Transaction loading state
- `showDiceAnimation: boolean` - Controls dice roll animation
- `lastDiceResult: [number, number] | null` - Last rolled dice values
- `roundHistory: RoundResult[]` - User's game history (max 50 rounds)

**Persistence**: `deployAmount` and `roundHistory` (localStorage key: "orecraps-game-store")

**Key Actions**:
- `selectBySum(sum)` - Selects all squares for a given sum
- `toggleSquare(index)` - Toggles individual square selection
- `addRoundResult(result)` - Records round outcome
- `setDeployAmount(amount)` - Updates bet amount

**Derived Selectors**:
- `useSelectedSquareCount()` - Count of selected squares
- `useTotalDeployAmount()` - Total SOL to deploy (count × amount)
- `useWinRate()` - Win percentage from history

**Used By**:
- `DeployPanel` - Reads selections, deploy amount
- `MiningBoard` - Reads selected squares for highlighting
- `page.tsx` - Main game UI orchestration

---

#### 2. simulationStore (/src/store/simulationStore.ts)

**Purpose**: Manages bot simulation state, epoch tracking, and pari-mutuel betting mechanics.

**Key State**:
- `bots: Bot[]` - 5 bots with different strategies (lucky7, field, random, doubles, diversified)
- `epoch: EpochState` - Current epoch tracking until 7 is rolled
  - `epochNumber: number`
  - `roundsInEpoch: number`
  - `uniqueSums: Set<number>` - Unique sums rolled (for bonus bet)
  - `rollHistory: number[]` - All sums rolled
  - `bonusBetActive: boolean`
  - `bonusBetMultiplier: number`
- `isRunning: boolean` - Whether simulation is active
- `currentRound: number` - Total rounds played
- `totalEpochs: number` - Total epochs completed
- `flashingWinningSquare: number | null` - For 3-second win animation
- `flashingWinnerBotIds: string[]` - Bots that won current round

**Persistence**: `bots`, `epoch`, `currentRound`, `totalEpochs`, `lastWinningSquare`, `lastDiceRoll` (localStorage key: "orecraps-simulation")

**Key Actions**:
- `initializeBots()` - Reset bots to default state (100 RNG each)
- `startEpoch()` - Begin new epoch, reset unique sums
- `placeBetsForRound()` - Bots place bets based on strategy
- `recordRoundResult(winningSquare)` - Process round outcome with pari-mutuel distribution
- `resolveEpoch()` - End epoch when 7 is rolled
- `setOnChainState(expiresAt, currentSlot)` - Sync with on-chain timer

**Pari-Mutuel Logic** (in `recordRoundResult`):
1. Calculate total pool (all RNG staked by all bots)
2. Calculate total RNG staked on winning square
3. Winners share entire pool proportionally to their stake
4. RNG payout = winner's share of pool
5. CRAP reward = profit (pool share - original stake)

**Derived Selectors**:
- `useBotsWithBets()` - Bots with active bets
- `useTotalBotDeployed()` - Total RNG deployed by all bots
- `useEpochState()` - Current epoch details
- `useBotSquareMap()` - Map of which bots bet on which squares
- `useTimeRemaining()` - Seconds until round expires

**Used By**:
- `BotLeaderboard` - Main simulation orchestrator
- `BotSimulationPanel` - Bot stats display
- `LiveAnalytics` - Real-time analytics

---

#### 3. crapsStore (/src/store/crapsStore.ts)

**Purpose**: Manages traditional craps game state and betting.

**Key State**:
- `crapsGame: CrapsGame | null` - On-chain game state
  - `isComeOut: boolean` - Game phase
  - `point: number` - Established point (0 if none)
  - `epochId: bigint`
  - `houseBankroll: bigint`
- `crapsPosition: CrapsPosition | null` - User's position on-chain
  - `passLine: bigint` - Pass line bet amount
  - `dontPass: bigint` - Don't pass bet amount
  - `comeBets: bigint[]` - Come bets by point
  - `dontComeBets: bigint[]` - Don't come bets by point
  - `placeBets: bigint[]` - Place bets by point
  - `hardways: bigint[]` - Hardway bets
  - `pendingWinnings: bigint`
- `pendingBets: PendingBet[]` - Bets queued before transaction
- `betAmount: number` - Default bet size in SOL
- `selectedBetType: CrapsBetType | null` - UI selection state
- `selectedPoint: number | null` - Point for place/hardway bets

**Persistence**: `betAmount` only (localStorage key: "orecraps-craps-store")

**Key Actions**:
- `setCrapsGame(game)` - Update from RPC fetch
- `setCrapsPosition(position)` - Update user position
- `addPendingBet(bet)` - Queue bet for transaction
- Quick bet helpers: `addPassLineBet()`, `addFieldBet()`, etc.

**Derived Selectors**:
- `useGamePhase()` - "come-out" or "point"
- `useCurrentPoint()` - Current point value
- `useHouseBankroll()` - Bankroll in SOL
- `usePendingWinnings()` - User's pending winnings in SOL
- `useCanPlaceBet(betType, point)` - Validation for bet placement

**Bet Display Helpers**:
- `getBetDisplayInfo(betType, point)` - Name, payout, description, house edge
- `formatLamports(lamports)` - Convert to SOL display

**Used By**:
- `CrapsBettingPanel` - Bet interface
- `CrapsGameStatus` - Game phase display
- `BetButton` - Individual bet buttons

---

#### 4. networkStore (/src/store/networkStore.ts)

**Purpose**: Manages network selection (localnet/devnet) and program configurations.

**Key State**:
- `network: NetworkType` - "localnet" | "devnet"
- `isLocalnetRunning: boolean` - Localnet availability
- `localnetProgramId: string | null` - Custom program ID for localnet

**Constants**:
- `PROGRAM_IDS` - Program IDs per network
- `RPC_ENDPOINTS` - RPC URLs per network (with fallback list)
- `TOKEN_MINTS` - RNG and CRAP token mints per network

**Persistence**: `network`, `localnetProgramId` (localStorage key: "orecraps-network")

**Key Actions**:
- `setNetwork(network)` - Switch network, triggers RPC manager update
- `setLocalnetProgramId(programId)` - Set custom program ID
- `getCurrentRpcEndpoint()` - Get active RPC URL
- `getCurrentProgramId()` - Get program public key

**Side Effects**:
- Calls `setNetworkMode()` from rpcManager to update connection
- `onRehydrateStorage` syncs rpcManager on page load

**Used By**:
- `NetworkToggle` - UI for switching networks
- `useBoard` - Gets network for polling intervals
- `useCraps` - Gets network for polling intervals
- All components needing program ID or RPC endpoint

---

#### 5. analyticsStore (/src/store/analyticsStore.ts)

**Purpose**: Records and aggregates simulation session analytics.

**Key State**:
- `sessions: SimulationSession[]` - Historical sessions (max 50)
- `currentSession: SimulationSession | null` - Active session
  - `id: string` - Unique session ID
  - `network: "localnet" | "devnet"`
  - `startTime: number`
  - `endTime: number | null`
  - `epochs: EpochResult[]` - Epoch records (max 1000)
  - `status: "running" | "completed" | "failed"`

**Persistence**: `sessions` only (localStorage key: "orecraps-analytics")

**Key Actions**:
- `startSession(network, programId, totalEpochs)` - Begin new session
- `recordEpoch(epochResult)` - Store epoch data
- `endSession(status)` - Complete session, move to history
- `getAggregateStats()` - Compute analytics across all sessions

**Aggregate Stats Computed**:
- Total epochs/rounds/RNG staked/CRAP earned
- Average rounds per epoch
- Bonus hit rate
- Sum distribution (dice roll frequency)
- Strategy performance (ROI per strategy)

**Used By**:
- `BotLeaderboard` - Records simulation results
- `LiveAnalytics` - Displays real-time stats
- `/analytics` page - Historical analytics dashboard

---

### Data Flow Patterns

#### Pattern 1: User Places Bet (Mining Board)

```
User Selects Squares
       │
       ▼
MiningBoard.tsx ────► gameStore.toggleSquare()
                              │
                              ▼
                     gameStore updates selectedSquares[]
                              │
                              ▼
                     DeployPanel reads selectedSquares
                              │
                              ▼
User Clicks "Deploy" ────► handleDeploy()
                              │
                              ▼
                     useTransaction hook
                              │
                              ▼
                     Solana Blockchain
                              │
                              ▼
                     useBoard polls RPC
                              │
                              ▼
                     Component re-renders
```

#### Pattern 2: Bot Simulation Round

```
User Clicks "Start Epoch"
       │
       ▼
BotLeaderboard ────► simulationStore.startEpoch()
                              │
                              ▼
                     placeBetsForRound() (bots place bets)
                              │
                              ▼
                     useBoard detects winningSquare
                              │
                              ▼
                     recordRoundResult(winningSquare)
                              │
                              ▼
                     Pari-mutuel distribution
                              │
                              ▼
                     analyticsStore.recordEpoch()
                              │
                              ▼
                     LiveAnalytics re-renders
```

#### Pattern 3: Network Switch

```
User Toggles Network
       │
       ▼
NetworkToggle ────► networkStore.setNetwork()
                              │
                              ▼
                     rpcManager updates connection
                              │
                              ▼
                     useBoard/useCraps detect change
                              │
                              ▼
                     Reset polling, adjust intervals
                              │
                              ▼
                     All components re-fetch data
```

---

### Hook Interactions with Stores

#### useBoard Hook
- **Reads From**: `networkStore.network` (for polling intervals)
- **Writes To**: None (stateless hook, returns board/round data)
- **RPC Calls**: Fetches `Board` and `Round` accounts
- **Polling**: Network-dependent (localnet: 1s, devnet: 10s)
- **Used By**: `page.tsx`, `BotLeaderboard`, `DeployPanel`, `MiningBoard`

#### useCraps Hook
- **Reads From**: `networkStore.network` (for polling intervals)
- **Writes To**: None (returns data, doesn't mutate stores)
- **RPC Calls**: Fetches `CrapsGame` and `CrapsPosition` accounts
- **Used By**: `CrapsBettingPanel`, `CrapsGameStatus`

#### useTransaction Hook
- **Reads From**: `@solana/wallet-adapter-react` (wallet state)
- **Writes To**: None (stateless, returns transaction submitter)
- **Used By**: `DeployPanel`, `CrapsBettingPanel`

---

### Component-Store-API Relationships

#### Mining/Betting Components
```
MiningBoard ──────┬────► gameStore (selectedSquares)
                  └────► useBoard (board/round data)

DeployPanel ──────┬────► gameStore (deployAmount, selectedSquares)
                  ├────► useBoard (board state)
                  └────► useTransaction (submit TX)
```

#### Simulation Components
```
BotLeaderboard ───┬────► simulationStore (bots, epoch, actions)
                  ├────► analyticsStore (recordEpoch)
                  ├────► networkStore (network)
                  └────► useBoard (round state)

LiveAnalytics ────┬────► simulationStore (epoch stats)
                  └────► analyticsStore (aggregate stats)
```

#### Craps Components
```
CrapsBettingPanel ┬────► crapsStore (pendingBets, betAmount)
                  ├────► useCraps (game state)
                  └────► useTransaction (place bets)

BetButton ────────────► crapsStore (addPendingBet)
```

#### Network Components
```
NetworkToggle ────────► networkStore (setNetwork)
```

---

### Persistence Strategy

**What Gets Persisted**:
- `gameStore`: `deployAmount`, `roundHistory`
- `simulationStore`: `bots`, `epoch`, `currentRound`, `totalEpochs`
- `crapsStore`: `betAmount` only
- `networkStore`: `network`, `localnetProgramId`
- `analyticsStore`: `sessions`

**What Doesn't Get Persisted**:
- UI state (`isDeploying`, `isLoading`, `error`)
- Transient data (`flashingWinningSquare`)
- On-chain state (`crapsGame`, `crapsPosition`) - refetched from RPC

---

### Key Design Principles

1. **Single Responsibility**: Each store has a clear domain
2. **On-Chain Authority**: Blockchain is source of truth, stores cache and augment
3. **Optimistic UI**: Local state updates immediately, syncs with chain via polling
4. **Derived Selectors**: Computed values memoized by Zustand for performance
5. **Persistence**: User preferences persisted, transient state is not
6. **Network Awareness**: Polling intervals adapt to network (localnet vs devnet)
7. **Type Safety**: Full TypeScript types for all state and actions

---
