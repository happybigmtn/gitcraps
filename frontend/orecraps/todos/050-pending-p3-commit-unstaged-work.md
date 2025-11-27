---
status: completed
priority: p3
issue_id: "050"
tags: [git, development-practice]
dependencies: []
resolved_date: 2025-11-27
---

# Commit Unstaged Work - 17 Modified + 30 Untracked Files

## Problem Statement
There is a massive amount of uncommitted work in the repository - 17 modified files and 30+ untracked files. This risks losing work and makes code review difficult.

## Findings
- **Modified files (17)**:
  - api/src/consts.rs
  - api/src/instruction.rs
  - api/src/state/mod.rs
  - frontend/orecraps/package*.json
  - Multiple frontend components and stores
  - program/src/lib.rs

- **Untracked files (30+)**:
  - 5 new craps program files (place_bet, settle, claim, fund, utils)
  - 2 new API state files (craps_game.rs, craps_position.rs)
  - New hooks (useCraps.ts)
  - New stores (analyticsStore, crapsStore, networkStore)
  - Analytics and network components
  - Playwright test suite
  - 22 TODO files in todos/
  - 2.8GB .localnet-ledger/ (should be ignored)

## Impact
- Risk of losing work if environment fails
- Difficult to review changes atomically
- No git history for new features
- TODO system not version controlled

## Proposed Solution

### Commit in logical chunks:

**Commit 1: Infrastructure & Config**
```bash
git add .gitignore
git add frontend/orecraps/package*.json
git commit -m "chore: update gitignore and dependencies"
```

**Commit 2: Craps Program Backend**
```bash
git add api/src/state/craps_game.rs
git add api/src/state/craps_position.rs
git add api/src/state/mod.rs
git add api/src/consts.rs
git add api/src/instruction.rs
git add program/src/place_craps_bet.rs
git add program/src/settle_craps.rs
git add program/src/claim_craps_winnings.rs
git add program/src/fund_craps_house.rs
git add program/src/craps_utils.rs
git add program/src/lib.rs
git commit -m "feat: add craps betting game on-chain program"
```

**Commit 3: Craps Frontend**
```bash
git add frontend/orecraps/src/store/crapsStore.ts
git add frontend/orecraps/src/hooks/useCraps.ts
git add frontend/orecraps/src/components/craps/
git commit -m "feat: add craps betting frontend"
```

**Commit 4: Analytics & Network**
```bash
git add frontend/orecraps/src/store/analyticsStore.ts
git add frontend/orecraps/src/store/networkStore.ts
git add frontend/orecraps/src/components/analytics/
git add frontend/orecraps/src/components/network/
git commit -m "feat: add analytics and network management"
```

**Commit 5: Tests**
```bash
git add frontend/orecraps/tests/
git add frontend/orecraps/playwright.config.ts
git commit -m "test: add Playwright e2e tests"
```

**Commit 6: TODO System**
```bash
git add frontend/orecraps/todos/
git commit -m "docs: add issue tracking TODO system"
```

### Add to .gitignore first:
```bash
echo ".localnet-ledger/" >> .gitignore
echo ".localnet-validator.log" >> .gitignore
```

## Technical Details
- **Files to commit**: 47+ files
- **Files to ignore**: .localnet-ledger/ (~2.8GB)
- **Commit message convention**: Use conventional commits (feat:, fix:, chore:, docs:, test:)

## Acceptance Criteria
- [ ] .localnet-ledger added to .gitignore
- [ ] All work committed in logical chunks
- [ ] Conventional commit messages used
- [ ] git status shows clean working tree
- [ ] TODO files version controlled

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered during git history analysis
- Identified massive uncommitted work
- Categorized as P3 NICE-TO-HAVE (but important for safety)

## Notes
Source: Multi-agent code review - Git History Analyzer
This is about development hygiene and risk mitigation.
