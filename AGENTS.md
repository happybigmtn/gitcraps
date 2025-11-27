# Coding Patterns & Security Guidelines

Key patterns established from code review. Follow these to avoid common vulnerabilities.

## Rust / Solana Program

### Checked Arithmetic
Always use checked math for u64 operations. Never use `+=`, `-=`, `*=` directly.

```rust
// BAD
balance += amount;

// GOOD
balance = balance
    .checked_add(amount)
    .ok_or(ProgramError::ArithmeticOverflow)?;
```

### Authority Validation
Always verify signer matches stored authority when account already exists.

```rust
// When loading existing account
let position = position_info.as_account_mut::<Position>(&program_id)?;
if position.authority != *signer_info.key {
    return Err(ProgramError::IllegalOwner);
}
```

### Account Ownership
Verify account owner before trusting data.

```rust
if account_info.owner != &expected_program_id {
    return Err(ProgramError::IncorrectProgramId);
}
```

### CEI Pattern (Check-Effects-Interactions)
Prevent reentrancy by updating state before external calls.

```rust
// 1. CHECK - validate inputs
if amount > balance { return Err(...); }

// 2. EFFECTS - update state FIRST
position.pending_winnings = 0;
position.total_claimed = position.total_claimed.checked_add(amount)?;

// 3. INTERACTIONS - external calls LAST
**signer_info.lamports.borrow_mut() += payout;
**source_info.lamports.borrow_mut() -= payout;
```

### Debug Logging
Use feature flags for debug logs in production code.

```rust
#[cfg(feature = "debug")]
sol_log(&format!("Debug: value={}", value));
```

### Bounds Validation
Validate array indices and input ranges.

```rust
if index >= array.len() {
    return Err(ProgramError::InvalidArgument);
}
```

## TypeScript / React

### Memoization
Wrap expensive components and stabilize callbacks.

```typescript
// Memoize component
const MemoizedComponent = React.memo(ExpensiveComponent);

// Stabilize callbacks
const handleClick = useCallback(() => {
  doSomething(id);
}, [id]);

// Memoize computed values
const computed = useMemo(() => expensiveCalc(data), [data]);
```

### Interval Cleanup
Always clear intervals on unmount.

```typescript
useEffect(() => {
  const interval = setInterval(poll, 1000);
  return () => clearInterval(interval);
}, []);
```

### Zustand Selectors
Use shallow comparison for object selections.

```typescript
import { useShallow } from 'zustand/react/shallow';

const { a, b } = useStore(useShallow(state => ({
  a: state.a,
  b: state.b
})));
```

## Git Security

### Never Commit
- `.env` files with secrets
- API keys, private keys
- `node_modules/`, build artifacts

### .gitignore Essentials
```
.env*
!.env.example
*.key
*.pem
node_modules/
target/
```

## API Security

### Command Injection Prevention
Never interpolate user input into shell commands.

```typescript
// BAD
exec(`program ${userInput}`);

// GOOD
spawnSync('program', [userInput], { encoding: 'utf-8' });
```

### Input Validation
Validate and sanitize at system boundaries.

```typescript
const validated = schema.parse(userInput);
```
