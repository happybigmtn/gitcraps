# OreCraps Frontend Development Plan

## Executive Summary

Build a modern, engaging frontend for the OreCraps dice-betting mining protocol. The interface will combine the existing 5x5 grid mining mechanics with a new dice-betting layer where miners predict dice sums (2-12) for multiplied ORE rewards.

---

## Current ore.supply Analysis

### Existing Interface Features
Based on research of the current ore.supply platform:

1. **5x5 Grid Mining Board**
   - 25 blocks displayed in a grid layout
   - Real-time visualization of SOL deployed per block
   - Miner count per block shown
   - One-minute round timer countdown

2. **Mining Flow**
   - Connect wallet (Phantom, Backpack, Solflare)
   - Select blocks on the grid
   - Choose SOL amount to deploy
   - Click "Deploy" button
   - Wait for round to complete
   - Claim rewards

3. **Autominer Feature**
   - Automatic block selection
   - Configurable: blocks per round, SOL per block, total rounds
   - Background operation

4. **Rewards Display**
   - SOL winnings from non-winning blocks
   - +1 ORE bonus for lucky winners
   - Motherlode jackpot (0.2 ORE/round, 1/625 chance)
   - 10% refining fee on claims

### Identified Improvements for OreCraps

| Current Feature | OreCraps Enhancement |
|-----------------|---------------------|
| Fixed ORE rewards | Dice-betting multipliers (6x-36x) |
| Random ORE bonus | Skill-based prediction game |
| Simple grid display | Animated dice roll reveals |
| Basic statistics | Probability charts & expected value calculator |
| No risk management | Safe mode option for guaranteed rewards |

---

## OreCraps Feature Specification

### Core Dice-Betting Mechanic

**Prediction Options:**
| Sum | Probability | Multiplier | Risk Level |
|-----|-------------|------------|------------|
| 0 (Safe) | 100% | 0.167x | None |
| 7 | 16.67% | 6x | Low |
| 6, 8 | 13.89% | 7.2x | Low-Medium |
| 5, 9 | 11.11% | 9x | Medium |
| 4, 10 | 8.33% | 12x | Medium-High |
| 3, 11 | 5.56% | 18x | High |
| 2, 12 | 2.78% | 36x | Very High |

**Key Insight:** All predictions have equal expected value (EV = base_reward), making it a fair game with player choice on variance.

### User Interface Components

#### 1. Navigation Header
```
┌────────────────────────────────────────────────────────────┐
│ 🎲 OreCraps          [Round #123]  [00:45]  [Connect Wallet]│
└────────────────────────────────────────────────────────────┘
```
- Logo with dice branding
- Current round number
- Countdown timer (animated)
- Wallet connection button (shows truncated address when connected)

#### 2. Mining Board (5x5 Grid)
```
┌─────┬─────┬─────┬─────┬─────┐
│  1  │  2  │  3  │  4  │  5  │
│0.5◎ │1.2◎ │0.8◎ │2.1◎ │0.3◎ │
│ 12  │ 28  │ 19  │ 45  │  8  │
├─────┼─────┼─────┼─────┼─────┤
│  6  │  7  │  8  │  9  │ 10  │
│...  │...  │...  │...  │...  │
└─────┴─────┴─────┴─────┴─────┘
```
- Each square shows: SOL deployed (◎), miner count
- Heatmap coloring based on deployment volume
- Click to select squares for deployment
- Winning square highlighted after round

#### 3. Dice Betting Panel (NEW - Primary Feature)
```
┌──────────────────────────────────────────────────┐
│           🎲 PREDICT THE DICE ROLL 🎲            │
├──────────────────────────────────────────────────┤
│                                                  │
│    [SAFE]  Guaranteed 1/6 reward                 │
│                                                  │
│  ┌─────────────────────────────────────────┐    │
│  │  2    3    4    5    6    7    8    9   │    │
│  │ 36x  18x  12x   9x 7.2x  6x 7.2x  9x   │    │
│  │                      ▲                  │    │
│  │ 10   11   12                            │    │
│  │ 12x  18x  36x                           │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  Your Prediction: [  7  ]  Potential: 6x        │
│  Base Reward: ~0.15 ORE → Win: ~0.9 ORE         │
│                                                  │
└──────────────────────────────────────────────────┘
```
- Visual selector for dice sum (2-12) or Safe mode
- Real-time potential reward calculation
- Probability visualization
- Risk indicator (color-coded)

#### 4. Dice Roll Animation (Post-Round)
```
┌──────────────────────────────────────────────────┐
│                                                  │
│              ⚀  +  ⚃  =  5                       │
│                                                  │
│         🎉 YOU PREDICTED 5! 9x WINNER! 🎉        │
│                                                  │
│              +1.35 ORE                           │
│                                                  │
└──────────────────────────────────────────────────┘
```
- Animated 3D dice roll reveal
- Dramatic reveal of sum
- Win/loss celebration animation
- Reward amount display

#### 5. Probability Distribution Chart
```
┌──────────────────────────────────────────────────┐
│  Dice Sum Probability Distribution               │
│                                                  │
│  6 │          ████████████                       │
│  5 │        ██████████                           │
│  4 │      ████████                               │
│  3 │    ██████                                   │
│  2 │  ████                                       │
│  1 │██                                           │
│    └────────────────────────────────             │
│      2  3  4  5  6  7  8  9 10 11 12             │
│                                                  │
│  EV Calculator: All predictions = 1x base       │
└──────────────────────────────────────────────────┘
```
- Interactive bar chart showing probability
- Hover for details (ways to roll, exact %)
- Expected value comparison

#### 6. Deployment Panel
```
┌──────────────────────────────────────────────────┐
│  DEPLOY SOL                                      │
├──────────────────────────────────────────────────┤
│  Amount per square: [    0.1    ] ◎              │
│  Selected squares:  [1, 7, 13, 19, 25] (5)       │
│  Total deployment:  0.5 ◎                        │
│                                                  │
│  Dice Prediction:   [ 7 - Lucky Seven ]          │
│                                                  │
│  ┌────────────────────────────────────────┐     │
│  │           [ DEPLOY NOW ]                │     │
│  └────────────────────────────────────────┘     │
└──────────────────────────────────────────────────┘
```

#### 7. Player Stats Dashboard
```
┌──────────────────────────────────────────────────┐
│  YOUR MINING STATS                               │
├──────────────────────────────────────────────────┤
│  Claimable SOL:    1.234 ◎    [Claim]           │
│  Claimable ORE:    5.678      [Claim]           │
│                                                  │
│  Lifetime SOL:     45.67 ◎                      │
│  Lifetime ORE:     123.45                        │
│                                                  │
│  Current Prediction: 7 (6x)                      │
│  Last 10 Rounds:   Win: 4 | Loss: 6              │
│  Dice Win Rate:    40%                           │
└──────────────────────────────────────────────────┘
```

#### 8. Round History
```
┌──────────────────────────────────────────────────┐
│  ROUND HISTORY                                   │
├──────────────────────────────────────────────────┤
│  #123  Square 17  🎲 4+3=7  Total: 45.6◎        │
│  #122  Square 3   🎲 6+6=12 Total: 38.2◎  🏆    │
│  #121  Square 21  🎲 2+5=7  Total: 52.1◎        │
│  #120  Square 8   🎲 1+1=2  Total: 29.8◎        │
│  ...                                             │
└──────────────────────────────────────────────────┘
```
- Historical rounds with dice results
- Winning square indicator
- Total SOL deployed per round
- Click to expand for details

---

## Technical Architecture

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | Next.js 14+ (App Router) | SSR, file-based routing |
| Styling | TailwindCSS v4 | Utility-first CSS |
| Components | shadcn/ui | Accessible UI primitives |
| Animations | Framer Motion | Dice roll animations |
| State | Zustand | Game state management |
| Data Fetching | TanStack Query v5 | Blockchain data caching |
| Wallet | @solana/wallet-adapter-react | Multi-wallet support |
| Blockchain | @solana/web3.js | Transaction building |
| Charts | Recharts | Probability visualization |

### Project Structure

```
/orecraps-frontend
├── /src
│   ├── /app
│   │   ├── layout.tsx           # Root with providers
│   │   ├── page.tsx             # Home/Mining interface
│   │   ├── /history             # Round history page
│   │   └── /stats               # Global statistics
│   ├── /components
│   │   ├── /board
│   │   │   ├── MiningBoard.tsx  # 5x5 grid
│   │   │   ├── Square.tsx       # Individual square
│   │   │   └── SquareHeatmap.tsx
│   │   ├── /dice
│   │   │   ├── DiceBettingPanel.tsx
│   │   │   ├── DiceSelector.tsx
│   │   │   ├── DiceRollAnimation.tsx
│   │   │   ├── DiceResult.tsx
│   │   │   └── ProbabilityChart.tsx
│   │   ├── /deploy
│   │   │   ├── DeployPanel.tsx
│   │   │   └── DeployConfirmation.tsx
│   │   ├── /stats
│   │   │   ├── PlayerStats.tsx
│   │   │   ├── GlobalStats.tsx
│   │   │   └── RoundHistory.tsx
│   │   ├── /wallet
│   │   │   ├── WalletButton.tsx
│   │   │   └── WalletProvider.tsx
│   │   └── /ui                  # shadcn components
│   ├── /hooks
│   │   ├── useBoard.ts          # Board state subscription
│   │   ├── useRound.ts          # Current round data
│   │   ├── useMiner.ts          # Player account data
│   │   ├── useDiceRoll.ts       # Dice animation state
│   │   ├── useDeploy.ts         # Deploy transaction
│   │   └── useClaim.ts          # Claim rewards
│   ├── /lib
│   │   ├── solana.ts            # Connection helpers
│   │   ├── pda.ts               # PDA derivations
│   │   ├── dice.ts              # Dice probability math
│   │   └── format.ts            # Number formatting
│   ├── /store
│   │   ├── gameStore.ts         # Game state (Zustand)
│   │   └── uiStore.ts           # UI preferences
│   └── /types
│       ├── program.ts           # Program account types
│       └── events.ts            # Event types
├── package.json
├── next.config.js
├── tailwind.config.ts
└── tsconfig.json
```

### Key TypeScript Types

```typescript
// /src/types/program.ts

export interface Board {
  roundId: bigint;
  startSlot: bigint;
  endSlot: bigint;
}

export interface Round {
  id: bigint;
  deployed: bigint[];        // [25] SOL per square
  slotHash: Uint8Array;      // [32] RNG seed
  count: bigint[];           // [25] miners per square
  expiresAt: bigint;
  motherlode: bigint;
  rentPayer: PublicKey;
  topMiner: PublicKey;
  topMinerReward: bigint;
  totalDeployed: bigint;
  totalVaulted: bigint;
  totalWinnings: bigint;
  // Dice betting additions
  diceResults: [number, number];  // [die1, die2]
  diceSum: number;                // 2-12
}

export interface Miner {
  authority: PublicKey;
  deployed: bigint[];         // [25]
  cumulative: bigint[];       // [25]
  checkpointFee: bigint;
  checkpointId: bigint;
  lastClaimOreAt: bigint;
  lastClaimSolAt: bigint;
  rewardsFactor: number;
  rewardsSol: bigint;
  rewardsOre: bigint;
  refinedOre: bigint;
  roundId: bigint;
  lifetimeRewardsSol: bigint;
  lifetimeRewardsOre: bigint;
  // Dice betting addition
  dicePrediction: number;     // 0=safe, 2-12=prediction
}

export interface DiceMultiplier {
  sum: number;
  probability: number;
  multiplier: number;
  ways: number;
}

export const DICE_MULTIPLIERS: DiceMultiplier[] = [
  { sum: 2, probability: 1/36, multiplier: 36, ways: 1 },
  { sum: 3, probability: 2/36, multiplier: 18, ways: 2 },
  { sum: 4, probability: 3/36, multiplier: 12, ways: 3 },
  { sum: 5, probability: 4/36, multiplier: 9, ways: 4 },
  { sum: 6, probability: 5/36, multiplier: 7.2, ways: 5 },
  { sum: 7, probability: 6/36, multiplier: 6, ways: 6 },
  { sum: 8, probability: 5/36, multiplier: 7.2, ways: 5 },
  { sum: 9, probability: 4/36, multiplier: 9, ways: 4 },
  { sum: 10, probability: 3/36, multiplier: 12, ways: 3 },
  { sum: 11, probability: 2/36, multiplier: 18, ways: 2 },
  { sum: 12, probability: 1/36, multiplier: 36, ways: 1 },
];
```

### PDA Derivations (TypeScript)

```typescript
// /src/lib/pda.ts
import { PublicKey } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('oreV3EG1i9BEgiAJ8b177Z2S2rMarzak4NMv1kULvWv');

export function boardPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('board')],
    PROGRAM_ID
  );
}

export function roundPDA(roundId: bigint): [PublicKey, number] {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(roundId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('round'), buffer],
    PROGRAM_ID
  );
}

export function minerPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('miner'), authority.toBuffer()],
    PROGRAM_ID
  );
}

export function treasuryPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    PROGRAM_ID
  );
}
```

### Animation Specifications

#### Dice Roll Animation (Framer Motion)

```typescript
// /src/components/dice/DiceRollAnimation.tsx

const diceRollVariants = {
  rolling: {
    rotateX: [0, 360, 720, 1080, 1440],
    rotateY: [0, 180, 360, 540, 720],
    rotateZ: [0, 90, 180, 270, 360],
    scale: [1, 1.2, 1.3, 1.2, 1],
    transition: {
      duration: 2,
      ease: [0.4, 0, 0.2, 1],
    }
  },
  landed: {
    rotateX: 0,
    rotateY: 0,
    rotateZ: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 20,
    }
  }
};

const resultRevealVariants = {
  hidden: { opacity: 0, scale: 0.5, y: 50 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 260,
      damping: 20,
      delay: 0.3,
    }
  }
};
```

---

## Design System

### Color Palette

```css
:root {
  /* Primary - Solana branded */
  --solana-purple: #9945ff;
  --solana-green: #14f195;

  /* Gaming colors */
  --win: #10b981;           /* Emerald */
  --loss: #ef4444;          /* Red */
  --safe: #6366f1;          /* Indigo */
  --risky: #f59e0b;         /* Amber */

  /* Risk levels */
  --risk-low: #22c55e;      /* Green */
  --risk-medium: #eab308;   /* Yellow */
  --risk-high: #f97316;     /* Orange */
  --risk-extreme: #dc2626;  /* Red */

  /* Dice faces */
  --dice-bg: #1f2937;       /* Gray-800 */
  --dice-dot: #ffffff;      /* White */

  /* Background */
  --bg-primary: #0f0f0f;
  --bg-secondary: #1a1a1a;
  --bg-card: #262626;

  /* Text */
  --text-primary: #ffffff;
  --text-secondary: #a3a3a3;
  --text-muted: #525252;
}
```

### Typography

```css
/* Headings */
font-family: 'Inter', system-ui, sans-serif;

/* Numbers/Stats */
font-family: 'JetBrains Mono', monospace;

/* Dice display */
font-family: 'Noto Sans Symbols 2', sans-serif;
```

### Responsive Breakpoints

```css
/* Mobile first */
sm: 640px   /* Small tablets */
md: 768px   /* Tablets */
lg: 1024px  /* Desktop */
xl: 1280px  /* Large desktop */
2xl: 1536px /* Extra large */
```

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Project setup with Next.js 14, TailwindCSS, TypeScript
- [ ] Solana provider configuration
- [ ] Wallet adapter integration
- [ ] Basic layout and navigation
- [ ] PDA derivation utilities
- [ ] Account fetching hooks

### Phase 2: Core Mining Interface
- [ ] 5x5 mining board component
- [ ] Square selection logic
- [ ] SOL deployment panel
- [ ] Round timer countdown
- [ ] Deploy transaction building
- [ ] Transaction status feedback

### Phase 3: Dice Betting System
- [ ] Dice prediction selector component
- [ ] Probability chart visualization
- [ ] Expected value calculator
- [ ] Risk level indicators
- [ ] Safe mode toggle
- [ ] Prediction storage in transaction

### Phase 4: Animations & Polish
- [ ] 3D dice roll animation
- [ ] Result reveal animation
- [ ] Win/loss celebration effects
- [ ] Confetti for big wins
- [ ] Sound effects (optional)
- [ ] Loading states and skeletons

### Phase 5: Player Dashboard
- [ ] Claimable rewards display
- [ ] Claim SOL transaction
- [ ] Claim ORE transaction
- [ ] Lifetime statistics
- [ ] Dice win/loss tracking
- [ ] Round history with dice results

### Phase 6: Real-Time Features
- [ ] WebSocket subscription to program logs
- [ ] ResetEvent parsing for round completion
- [ ] DeployEvent for competitor activity
- [ ] Live dice roll broadcast
- [ ] Notifications for wins

### Phase 7: Advanced Features
- [ ] Autominer configuration
- [ ] Strategy presets (safe, balanced, risky)
- [ ] Historical analytics
- [ ] Leaderboard
- [ ] Mobile optimization
- [ ] PWA support

---

## Responsible Gaming Considerations

### Required Features

1. **Clear Odds Display**
   - Probability shown for every prediction
   - Expected value explanation
   - "All predictions have equal EV" messaging

2. **Session Statistics**
   - Time spent mining
   - Total SOL deployed session
   - Win/loss tracking

3. **Safe Mode Prominent**
   - Safe mode as default option
   - Guaranteed reward messaging
   - Risk-averse option highlighted

4. **Deposit Limits**
   - Optional self-imposed limits
   - Warning when approaching limits
   - Cooldown periods

5. **Educational Content**
   - How dice probability works
   - Explanation of multipliers
   - "This is a game of chance" disclaimer

---

## API Integration Points

### Solana Program: `oreV3EG1i9BEgiAJ8b177Z2S2rMarzak4NMv1kULvWv`

| Account | Seeds | Usage |
|---------|-------|-------|
| Board | `["board"]` | Current round, timing |
| Round | `["round", round_id]` | Deployments, dice results |
| Miner | `["miner", authority]` | Player state, prediction |
| Treasury | `["treasury"]` | Global stats |
| Config | `["config"]` | Protocol settings |

### Key Instructions

| Instruction | Purpose | New Parameter |
|-------------|---------|---------------|
| `Deploy` | Deploy SOL to squares | `dice_prediction: u8` |
| `Checkpoint` | Settle round rewards | - |
| `ClaimSOL` | Claim SOL winnings | - |
| `ClaimORE` | Claim ORE rewards | - |

### Events to Subscribe

| Event | Trigger | Data |
|-------|---------|------|
| `ResetEvent` | Round completion | dice_results, winning_square, totals |
| `DeployEvent` | New deployment | authority, amount, squares |
| `BuryEvent` | Token burn | amounts |

---

## Success Metrics

### User Engagement
- Daily Active Users (DAU)
- Average session duration
- Rounds played per user
- Dice prediction distribution

### Financial
- Total SOL deployed
- Average deployment size
- Claim rate
- Safe mode usage %

### Technical
- Page load time < 2s
- Transaction success rate > 99%
- Real-time update latency < 500ms
- Mobile responsiveness score

---

## References

### Internal Files
- `api/src/state/round.rs` - Round struct with dice fields
- `api/src/state/miner.rs` - Miner struct with dice_prediction
- `api/src/sdk.rs` - SDK deploy function
- `api/src/event.rs` - ResetEvent with dice data
- `program/src/deploy.rs` - Deploy instruction handler
- `program/src/reset.rs` - Dice roll calculation
- `program/src/checkpoint.rs` - Reward calculation

### External Resources
- [Solana Wallet Adapter](https://github.com/anza-xyz/wallet-adapter)
- [TanStack Query](https://tanstack.com/query/latest)
- [Framer Motion](https://motion.dev)
- [shadcn/ui](https://ui.shadcn.com)
- [Recharts](https://recharts.org)
- [TailwindCSS v4](https://tailwindcss.com)

---

*Generated with Claude Code for the OreCraps project*
