---
status: completed
priority: p3
issue_id: "044"
tags: [code-quality, frontend, refactoring]
dependencies: []
resolved_date: 2025-11-27
---

# Extract BetButton Component from CrapsBettingPanel

## Problem Statement
CrapsBettingPanel contains 50+ near-identical button components with inline styles and repeated patterns. Extracting a reusable BetButton component would reduce 150+ lines of code.

## Findings
- **Location**: `/home/r/Coding/ore/frontend/orecraps/src/components/craps/CrapsBettingPanel.tsx:309-523`
- **Pattern repeated**:
```tsx
<Button
  variant="outline"
  className="h-14 flex flex-col items-center justify-center"
  onClick={() => store.addPendingBet({ betType: CrapsBetType.PassLine, point: 0, amount: store.betAmount })}
  disabled={!canBet}
>
  <span className="text-sm font-bold">Pass Line</span>
  <span className="text-[10px] text-muted-foreground">1:1</span>
</Button>
```
- **50+ similar buttons** with slight variations

## Proposed Solution

### Extract BetButton component
```tsx
// components/craps/BetButton.tsx
interface BetButtonProps {
  betType: CrapsBetType;
  point?: number;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  variant?: 'default' | 'destructive' | 'secondary';
}

export function BetButton({
  betType,
  point = 0,
  label,
  sublabel,
  icon,
  disabled,
  variant = 'outline',
}: BetButtonProps) {
  const store = useCrapsStore();
  const { canBet, reason } = useCanPlaceBet(betType, point);
  const info = getBetDisplayInfo(betType, point);

  return (
    <Button
      variant={variant}
      className="h-14 flex flex-col items-center justify-center"
      onClick={() => store.addPendingBet({
        betType,
        point,
        amount: store.betAmount,
      })}
      disabled={disabled || !canBet}
      title={reason}
    >
      {icon && <span className="mb-1">{icon}</span>}
      <span className="text-sm font-bold">{label}</span>
      <span className="text-[10px] text-muted-foreground">
        {sublabel || info.payout}
      </span>
    </Button>
  );
}
```

**Usage**:
```tsx
// Line bet section
<BetButton betType={CrapsBetType.PassLine} label="Pass Line" />
<BetButton betType={CrapsBetType.DontPass} label="Don't Pass" />

// Place bets
{POINT_NUMBERS.map(point => (
  <BetButton key={point} betType={CrapsBetType.Place} point={point} label={String(point)} />
))}

// Hardways
{HARDWAY_NUMBERS.map(num => (
  <BetButton key={num} betType={CrapsBetType.Hardway} point={num} label={`Hard ${num}`} />
))}
```

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/frontend/orecraps/src/components/craps/CrapsBettingPanel.tsx`
- **New Files**:
  - `/home/r/Coding/ore/frontend/orecraps/src/components/craps/BetButton.tsx`
- **LOC Reduction**: ~150 lines
- **Related Components**: All betting UI

## Acceptance Criteria
- [ ] BetButton component created with full prop support
- [ ] All bet buttons in CrapsBettingPanel use BetButton
- [ ] Styling consistent with current design
- [ ] Accessibility: title/aria-label for disabled state
- [ ] CrapsBettingPanel reduced from 677 to ~500 lines

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered during code simplicity review
- Identified 50+ repeated patterns
- Categorized as P3 NICE-TO-HAVE

## Notes
Source: Multi-agent code review - Code Simplicity Reviewer
High-impact refactoring with minimal risk.
