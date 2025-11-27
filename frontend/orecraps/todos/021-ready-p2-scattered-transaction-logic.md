---
status: ready
priority: p2
issue_id: "021"
tags: [architecture, abstraction, transactions]
dependencies: []
---

# Transaction Building Logic Scattered in Components

## Problem Statement
Each component that needs to send transactions builds them manually, repeating the same pattern without abstraction.

## Findings
- Location: `DeployPanel.tsx`, `CrapsBettingPanel.tsx` (Lines 83-125)
- Same pattern repeated: create transaction, add instruction, get blockhash, set fee payer, send
- No shared abstraction for transaction building
- Changes to transaction logic require updating multiple files

## Proposed Solutions

### Option 1: Create transaction service
- **Pros**: DRY principle, centralized transaction logic
- **Cons**: Another abstraction layer
- **Effort**: Medium
- **Risk**: Low

```typescript
// src/lib/transactionService.ts
export async function sendSignedTransaction(
  connection: Connection,
  instructions: TransactionInstruction[],
  wallet: WalletContextState
): Promise<string> {
  // Shared implementation
}
```

## Recommended Action
Create a transaction service that handles the common transaction building pattern and use it in all components that submit transactions.

## Technical Details
- **Affected Files**:
  - New: `src/lib/transactionService.ts`
  - Update: `src/components/deploy/DeployPanel.tsx`
  - Update: `src/components/craps/CrapsBettingPanel.tsx`
- **Related Components**: All transaction-submitting components
- **Database Changes**: No

## Acceptance Criteria
- [ ] Create transactionService utility
- [ ] Update DeployPanel to use service
- [ ] Update CrapsBettingPanel to use service
- [ ] Build passes
- [ ] Transactions still work correctly

## Work Log

### 2025-11-26 - Initial Discovery
**By:** Claude Triage System
**Actions:**
- Issue discovered during code review triage
- Categorized as P2 (Medium - Architecture)
- Estimated effort: Medium

## Notes
Source: Triage session on 2025-11-26
