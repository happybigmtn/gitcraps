---
status: completed
priority: p3
issue_id: "045"
tags: [code-quality, frontend, refactoring]
dependencies: []
resolved_date: 2025-11-27
---

# Extract useTransaction Hook for Transaction Handling

## Problem Statement
Transaction building and submission logic is duplicated across multiple components (CrapsBettingPanel, BotLeaderboard, DeployPanel). Each implements the same pattern of getting blockhash, building transaction, sending, and confirming.

## Findings
- **Duplicate locations**:
  - `/home/r/Coding/ore/frontend/orecraps/src/components/craps/CrapsBettingPanel.tsx:68-140`
  - `/home/r/Coding/ore/frontend/orecraps/src/components/simulation/BotLeaderboard.tsx` (multiple)
  - `/home/r/Coding/ore/frontend/orecraps/src/components/deploy/DeployPanel.tsx`

- **Repeated pattern** (~50 lines each):
```typescript
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
const tx = new Transaction().add(...instructions);
tx.recentBlockhash = blockhash;
tx.feePayer = publicKey;

const sig = await sendTransaction(tx, connection);
if (!sig || !sig.length) throw new Error('Invalid signature');

await connection.confirmTransaction({
  signature: sig,
  blockhash,
  lastValidBlockHeight,
});
toast.success('Transaction confirmed!');
```

## Proposed Solution

### Create useTransaction hook
```typescript
// hooks/useTransaction.ts
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, TransactionInstruction } from '@solana/web3.js';
import { toast } from 'sonner';

interface UseTransactionOptions {
  onSuccess?: (signature: string) => void;
  onError?: (error: Error) => void;
}

export function useTransaction(options: UseTransactionOptions = {}) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitTransaction = useCallback(async (
    instructions: TransactionInstruction[],
    successMessage?: string
  ): Promise<string | null> => {
    if (!publicKey) {
      toast.error('Wallet not connected');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

      const tx = new Transaction().add(...instructions);
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const signature = await sendTransaction(tx, connection);

      if (!signature) {
        throw new Error('No signature returned');
      }

      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });

      toast.success(successMessage || 'Transaction confirmed!');
      options.onSuccess?.(signature);
      return signature;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transaction failed';
      setError(message);
      toast.error(message);
      options.onError?.(err instanceof Error ? err : new Error(message));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [connection, publicKey, sendTransaction, options]);

  return {
    submitTransaction,
    isLoading,
    error,
  };
}
```

**Usage**:
```typescript
// In CrapsBettingPanel
const { submitTransaction, isLoading } = useTransaction();

const handleSubmitBets = async () => {
  const instructions = buildBetInstructions(pendingBets);
  await submitTransaction(instructions, `Placed ${pendingBets.length} bets!`);
  refetch();
};
```

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/frontend/orecraps/src/components/craps/CrapsBettingPanel.tsx`
  - `/home/r/Coding/ore/frontend/orecraps/src/components/simulation/BotLeaderboard.tsx`
  - `/home/r/Coding/ore/frontend/orecraps/src/components/deploy/DeployPanel.tsx`
- **New Files**:
  - `/home/r/Coding/ore/frontend/orecraps/src/hooks/useTransaction.ts`
- **LOC Reduction**: ~100 lines across files

## Acceptance Criteria
- [ ] useTransaction hook created with loading/error state
- [ ] All components migrated to use hook
- [ ] Consistent error handling across app
- [ ] Toast notifications standardized
- [ ] Unit tests for hook

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered during code simplicity review
- Identified transaction pattern duplication
- Categorized as P3 NICE-TO-HAVE

## Notes
Source: Multi-agent code review - Code Simplicity Reviewer, TypeScript Reviewer
