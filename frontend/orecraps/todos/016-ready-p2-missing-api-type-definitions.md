---
status: ready
priority: p2
issue_id: "016"
tags: [code-quality, type-safety, api]
dependencies: []
---

# Missing Type Definitions for API Responses

## Problem Statement
API calls use bare `fetch()` without response type definitions. No validation that the response matches expected schema. Changes to API contracts go undetected until runtime.

## Findings
- Location: Components making fetch calls (BotLeaderboard, NetworkToggle, etc.)
- No TypeScript interfaces for API responses
- `response.json()` returns `any`
- Breaking API changes not caught at compile time

## Proposed Solutions

### Option 1: Create shared types file for API responses
- **Pros**: Type safety, compile-time checking
- **Cons**: Requires maintaining types alongside APIs
- **Effort**: Medium
- **Risk**: Low

```typescript
// src/types/api.ts
export interface StartRoundResponse {
  success: boolean;
  message: string;
  roll?: { die1: number; die2: number; sum: number; square: number };
  signature?: string;
  error?: string;
}
```

## Recommended Action
Create a shared types file and use it in both API routes (for return types) and components (for response handling).

## Technical Details
- **Affected Files**:
  - New: `src/types/api.ts`
  - Update: All components with fetch calls
- **Related Components**: API communication
- **Database Changes**: No

## Acceptance Criteria
- [ ] Create src/types/api.ts with all response types
- [ ] Update API routes to use types
- [ ] Update components to type responses
- [ ] Build passes

## Work Log

### 2025-11-26 - Initial Discovery
**By:** Claude Triage System
**Actions:**
- Issue discovered during code review triage
- Categorized as P2 (Medium - Code Quality)
- Estimated effort: Medium

## Notes
Source: Triage session on 2025-11-26
