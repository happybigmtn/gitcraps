---
status: completed
priority: p2
issue_id: "014"
tags: [code-quality, consistency, api]
dependencies: []
---

# Inconsistent Error Handling Patterns

## Problem Statement
Different API routes handle errors inconsistently, making debugging harder and error responses unpredictable for clients.

## Findings
- `start-round`: Returns error in response body with status 500
- `reset-round`: Same approach
- `faucet`: Catches specific error types vs generic errors
- `localnet`: Uses `String(error)` conversion
- No standardized error response format

## Proposed Solutions

### Option 1: Create standardized error handler
- **Pros**: Consistent responses, easier debugging
- **Cons**: Requires updating all API routes
- **Effort**: Small
- **Risk**: Low

```typescript
function handleApiError(error: unknown) {
  console.error("API Error:", error);
  const message = error instanceof Error ? error.message : "Unknown error";
  const details = error instanceof Error ? error.stack : "";
  return NextResponse.json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === "development" && { details })
  }, { status: 500 });
}
```

## Recommended Action
Create a shared error handling utility and use it in all API routes.

## Technical Details
- **Affected Files**: All API routes
- **Related Components**: Error handling, API responses
- **Database Changes**: No

## Acceptance Criteria
- [ ] Create shared handleApiError utility
- [ ] Update all API routes to use it
- [ ] Build passes

## Work Log

### 2025-11-26 - Initial Discovery
**By:** Claude Triage System
**Actions:**
- Issue discovered during code review triage
- Categorized as P2 (Medium - Code Quality)
- Estimated effort: Small

## Notes
Source: Triage session on 2025-11-26
