# Transaction Service Usage Examples

The TransactionService provides a centralized, type-safe way to build and send Solana transactions.

## Table of Contents

- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [Client-Side (Wallet) Examples](#client-side-wallet-examples)
- [Server-Side (Keypair) Examples](#server-side-keypair-examples)
- [Craps Operations](#craps-operations)
- [Mining Operations](#mining-operations)
- [Advanced Usage](#advanced-usage)
- [Error Handling](#error-handling)
- [Migration Guide](#migration-guide)

## Installation

```typescript
import { TransactionService } from '@/services';
```

## Basic Usage

### Creating a Service Instance

```typescript
// Without connection (uses network abstraction)
const service = new TransactionService();

// With specific connection
const service = new TransactionService(connection);

// Or use the factory function
import { createTransactionService } from '@/services';
const service = createTransactionService();
```

## Client-Side (Wallet) Examples

### Example 1: Place a Single Craps Bet

```typescript
import { TransactionService } from '@/services';
import { CrapsBetType } from '@/lib/program';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';

function BettingComponent() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const service = new TransactionService();

  const handlePlaceBet = async () => {
    const result = await service.placeCrapsBets(
      wallet,
      connection,
      [
        {
          betType: CrapsBetType.PassLine,
          amount: 0.1, // 0.1 SOL
        }
      ]
    );

    if (result.success) {
      console.log('Bet placed! Signature:', result.signature);
      console.log('Bets placed:', result.betsPlaced);
    } else {
      console.error('Failed to place bet:', result.error);
    }
  };

  return (
    <button onClick={handlePlaceBet} disabled={!wallet.connected}>
      Place Pass Line Bet
    </button>
  );
}
```

### Example 2: Place Multiple Bets Atomically

```typescript
const result = await service.placeCrapsBets(
  wallet,
  connection,
  [
    { betType: CrapsBetType.PassLine, amount: 0.1 },
    { betType: CrapsBetType.Field, amount: 0.05 },
    { betType: CrapsBetType.Place, point: 6, amount: 0.06 },
    { betType: CrapsBetType.Hardway, point: 8, amount: 0.02 },
  ]
);

if (result.success) {
  toast.success(`Placed ${result.betsPlaced} bets successfully!`);
} else {
  toast.error(`Failed to place bets: ${result.error}`);
}
```

### Example 3: Claim Winnings

```typescript
const result = await service.claimCrapsWinnings(wallet, connection);

if (result.success) {
  toast.success('Winnings claimed!');
  refetchCrapsPosition(); // Refresh UI
} else {
  toast.error(`Failed to claim: ${result.error}`);
}
```

### Example 4: Deploy to Mining Squares

```typescript
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

const selectedSquares = new Array(36).fill(false);
selectedSquares[0] = true;  // Select 1-1
selectedSquares[7] = true;  // Select 2-2

const result = await service.deploy(
  wallet,
  connection,
  {
    amount: BigInt(0.5 * LAMPORTS_PER_SOL), // 0.5 SOL
    roundId: board.roundId,
    squares: selectedSquares,
  }
);

if (result.success) {
  toast.success('Deployed to squares!');
} else {
  toast.error(`Deploy failed: ${result.error}`);
}
```

## Server-Side (Keypair) Examples

### Example 5: Place Bet with Keypair (API Route)

```typescript
// In an API route handler
import { TransactionService } from '@/services';
import { Connection, Keypair } from '@solana/web3.js';
import { createPlaceCrapsBetInstruction, CrapsBetType } from '@/lib/program';

export async function POST(request: Request) {
  const connection = new Connection('http://127.0.0.1:8899');
  const payer = Keypair.fromSecretKey(/* load keypair */);
  const service = new TransactionService(connection);

  const instructions = [
    createPlaceCrapsBetInstruction(
      payer.publicKey,
      CrapsBetType.PassLine,
      0,
      BigInt(100_000_000) // 0.1 SOL in lamports
    )
  ];

  const result = await service.sendWithKeypair(
    instructions,
    payer,
    connection
  );

  return NextResponse.json(result);
}
```

### Example 6: Multiple Instructions with Additional Signers

```typescript
const authority = Keypair.generate();
const additionalSigner = Keypair.generate();

const instructions = [
  instruction1,
  instruction2,
  instruction3,
];

const result = await service.sendWithKeypair(
  instructions,
  authority,
  connection,
  [additionalSigner], // Additional signers array
  { commitment: 'finalized' } // Options
);
```

## Craps Operations

### Example 7: Fund the House Bankroll

```typescript
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

const result = await service.fundCrapsHouse(
  wallet,
  connection,
  BigInt(10 * LAMPORTS_PER_SOL) // 10 SOL
);

if (result.success) {
  toast.success('House funded!');
}
```

### Example 8: Settle Craps Round

```typescript
const result = await service.settleCraps(
  wallet,
  connection,
  {
    winningSquare: BigInt(14), // The winning square index
    roundId: currentRoundId,
  }
);

if (result.success) {
  toast.success('Bets settled!');
  refetchPosition();
}
```

## Mining Operations

### Example 9: Checkpoint Mining Progress

```typescript
const result = await service.checkpoint(
  wallet,
  connection,
  currentRoundId,
  { commitment: 'confirmed' }
);
```

### Example 10: Claim Mining SOL Rewards

```typescript
const result = await service.claimSOL(wallet, connection);

if (result.success) {
  toast.success('Rewards claimed!');
  refetchMinerState();
}
```

## Advanced Usage

### Example 11: Custom Transaction with Options

```typescript
const result = await service.sendWithWallet(
  [instruction1, instruction2],
  wallet,
  connection,
  {
    commitment: 'finalized',  // Wait for finalization
    skipPreflight: false,     // Run preflight checks
    maxRetries: 5,           // Retry up to 5 times
  }
);
```

### Example 12: Simulation Mode (Testing/Demo)

```typescript
// Simulate a transaction without sending it
const result = await service.simulateTransaction({
  signaturePrefix: 'demo', // Optional prefix
});

console.log(result);
// { success: true, signature: 'demo_abc123_xyz789' }
```

### Example 13: Custom Instructions

```typescript
import { SystemProgram } from '@solana/web3.js';

// Send custom instructions not covered by typed methods
const instructions = [
  SystemProgram.transfer({
    fromPubkey: wallet.publicKey!,
    toPubkey: recipientKey,
    lamports: 1_000_000,
  }),
  // ... more instructions
];

const result = await service.sendWithWallet(
  instructions,
  wallet,
  connection
);
```

## Error Handling

### Example 14: Comprehensive Error Handling

```typescript
async function placeBetWithErrorHandling() {
  const result = await service.placeCrapsBets(
    wallet,
    connection,
    [{ betType: CrapsBetType.PassLine, amount: 0.1 }]
  );

  if (result.success) {
    // Success handling
    toast.success(`Transaction confirmed: ${result.signature}`);
    refetchGameState();
    return result.signature;
  } else {
    // Error handling with user-friendly messages
    const error = result.error!;

    if (error.includes('cancelled')) {
      toast.info('You cancelled the transaction');
    } else if (error.includes('Insufficient')) {
      toast.error('Not enough SOL in your wallet');
    } else if (error.includes('rate limit')) {
      toast.warning('RPC rate limit hit. Try again in a moment.');
    } else {
      toast.error(`Transaction failed: ${error}`);
    }

    return null;
  }
}
```

### Example 15: Error Types

The service transforms errors into user-friendly messages:

```typescript
// Original errors → Transformed messages
"User rejected the request" → "Transaction cancelled by user"
"insufficient funds for transaction" → "Insufficient SOL balance for transaction"
"429 Too Many Requests" → "RPC rate limit exceeded. Please try again in a moment."
"fetch failed" → "Network error. Please check your connection."
"Blockhash not found" → "Transaction expired. Please try again."
```

## Migration Guide

### Migrating from useTransaction Hook

**Before:**
```typescript
import { useTransaction } from '@/hooks/useTransaction';

function Component() {
  const { submitTransaction, isLoading, error } = useTransaction();

  const handleBet = async () => {
    const instructions = [createPlaceCrapsBetInstruction(...)];
    await submitTransaction(instructions, 'Bet placed!');
  };
}
```

**After:**
```typescript
import { TransactionService } from '@/services';
import { useState } from 'react';

function Component() {
  const service = new TransactionService();
  const [isLoading, setIsLoading] = useState(false);

  const handleBet = async () => {
    setIsLoading(true);
    const result = await service.placeCrapsBets(wallet, connection, bets);
    setIsLoading(false);

    if (result.success) {
      toast.success('Bet placed!');
    }
  };
}
```

### Migrating from Inline Transaction Building

**Before:**
```typescript
// Inline transaction building
const transaction = new Transaction();
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
transaction.recentBlockhash = blockhash;
transaction.feePayer = publicKey;

for (const bet of bets) {
  const ix = createPlaceCrapsBetInstruction(...);
  transaction.add(ix);
}

const signature = await sendTransaction(transaction, connection);
await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight });
```

**After:**
```typescript
// Use the service
const service = new TransactionService();
const result = await service.placeCrapsBets(wallet, connection, bets);
```

### Migrating from CrapsGameService

**Before (using CrapsGameService):**
```typescript
import { CrapsGameService } from '@/services';

const gameService = new CrapsGameService(connection);
const result = await gameService.placeBets(payer, bets);
```

**After (using TransactionService):**
```typescript
import { TransactionService } from '@/services';

const service = new TransactionService(connection);
const result = await service.sendWithKeypair(
  bets.map(b => createPlaceCrapsBetInstruction(...)),
  payer,
  connection
);
```

## Best Practices

1. **Create once, reuse**: Create the service instance once and reuse it
2. **Use typed methods**: Prefer `placeCrapsBets()` over manual instruction building
3. **Handle errors**: Always check `result.success` and handle errors appropriately
4. **Use network abstraction**: Let the service handle failover automatically
5. **Provide clear options**: Specify commitment and retry options when needed
6. **Validate before sending**: Check wallet connection, balances, etc. before calling service
7. **Update UI after success**: Refetch data and show success messages
8. **Show user feedback**: Use toasts to inform users of transaction status

## Type Reference

```typescript
interface TransactionResult {
  success: boolean;
  signature?: string;
  error?: string;
}

interface SendTransactionOptions {
  commitment?: Commitment;
  skipPreflight?: boolean;
  maxRetries?: number;
}

interface PlaceBetParams {
  betType: CrapsBetType;
  point?: number;
  amount: number; // in SOL
}

interface DeployParams {
  amount: bigint;
  roundId: bigint;
  squares: boolean[];
}

interface SettleCrapsParams {
  winningSquare: bigint;
  roundId: bigint;
}
```

## Additional Resources

- Source code: `/src/services/transactionService.ts`
- Network abstraction: `/src/lib/network/`
- Program instructions: `/src/lib/program.ts`
- Updates log: `/docs/updates.md`
