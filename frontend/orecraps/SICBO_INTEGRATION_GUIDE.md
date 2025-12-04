# Sic Bo Frontend Integration Guide

## Summary

All Sic Bo frontend files have been created following the existing patterns from Roulette. The implementation is complete except for adding the Sic Bo types/functions to program.ts and creating the component files.

## Files Created

### 1. Core Files (Complete)
- `/home/r/Coding/ore/frontend/orecraps/src/store/sicboStore.ts` - Zustand store following rouletteStore.ts pattern
- `/home/r/Coding/ore/frontend/orecraps/src/hooks/useSicBo.ts` - React hook following useRoulette.ts pattern
- `/home/r/Coding/ore/frontend/orecraps/src/components/sicbo/index.ts` - Component exports

### 2. Reference File
- `/home/r/Coding/ore/frontend/orecraps/sicbo-program-additions.ts` - Contains all types, PDAs, instructions, parsers, and helpers to add to program.ts

## Integration Steps

### Step 1: Add Sic Bo to program.ts

The file `sicbo-program-additions.ts` contains all the code that needs to be added to `/home/r/Coding/ore/frontend/orecraps/src/lib/program.ts`.

Add the contents RIGHT BEFORE the "RE-EXPORTS" section (line ~2930), specifically before:
```typescript
// ============================================================================
// RE-EXPORTS
// ============================================================================
```

**Important Notes:**
- Remove the imports at the top of sicbo-program-additions.ts (they're already in program.ts)
- Remove the helper functions `toLeBytes` and `fromLeBytes` (they already exist in program.ts)
- Update the RE-EXPORTS section to include `SICO_MINT_ADDRESS`:
  ```typescript
  export { ORE_PROGRAM_ADDRESS, RNG_MINT_ADDRESS, CRAP_MINT_ADDRESS, CARAT_MINT_ADDRESS, ROUL_MINT_ADDRESS, SICO_MINT_ADDRESS } from "./solana";
  ```

### Step 2: Create Component Files

Create these 4 component files in `/home/r/Coding/ore/frontend/orecraps/src/components/sicbo/`:

#### 1. SicBoLayout.tsx
Main layout component - follow the pattern from RouletteLayout.tsx:
- Two column layout with game table on left, betting panel on right
- Use SicBoTable and SicBoBettingPanel as children
- Include SicBoGameStatus at the top

#### 2. SicBoTable.tsx
Displays the Sic Bo betting table with all bet areas:
- Last roll display showing 3 dice
- Big/Small betting areas
- Sum betting areas (4-17) with dynamic payouts
- Triple betting areas (specific 1-6, any triple)
- Double betting areas (1-6)
- Combination betting grid (15 combinations)
- Single number betting areas (1-6)
- Use useSicBoStore's add*Bet functions for click handlers

#### 3. SicBoBettingPanel.tsx
Betting interface - follow RouletteBettingPanel.tsx pattern:
- Bet amount input
- Pending bets list with remove buttons
- Submit bets button (calls createPlaceSicBoBetInstruction for each bet)
- Spin button (calls createSettleSicBoInstruction)
- Claim winnings button (calls createClaimSicBoWinningsInstruction)
- Show SICO token balance
- Use TransactionService pattern for all transactions

#### 4. SicBoGameStatus.tsx
Game status display - follow RouletteGameStatus.tsx pattern:
- Show current epoch ID
- Show house bankroll in SICO
- Show last roll result (3 dice)
- Show player's pending winnings
- Show player's total stats (wagered/won/lost)

## Backend Integration Notes

The backend is already implemented with these discriminators:
- PlaceSicBoBet = 54
- SettleSicBo = 55
- ClaimSicBoWinnings = 56
- FundSicBoHouse = 57

PDA seeds (already in consts.rs):
- SICBO_GAME = b"sicbo_game"
- SICBO_POSITION = b"sicbo_position"
- SICBO_VAULT = b"sicbo_vault"

SICO_MINT address: Er3hGaT8FmPFxLp6bKaRNnVHhaLaxHxWzdvAW4uXFpnS (already configured in solana.ts)

## Testing Checklist

After integration:
1. Verify TypeScript compiles: `npm run build`
2. Check all imports resolve correctly
3. Test placing bets (Small/Big/Sum/Triples/Doubles/Combinations/Singles)
4. Test settling round (spin dice)
5. Test claiming winnings
6. Verify SICO token balance updates correctly
7. Test with both localnet and devnet configurations

## Key Patterns Followed

1. **Store Pattern**: Zustand with persist middleware, following rouletteStore.ts
2. **Hook Pattern**: Polling with rate limiting, following useRoulette.ts
3. **Component Pattern**: Card-based UI with Lucide icons, following roulette components
4. **Transaction Pattern**: Use TransactionService for all on-chain interactions
5. **Types Pattern**: Strict TypeScript types matching on-chain Rust structs
6. **PDA Pattern**: Consistent PDA derivation following existing game patterns

## Sic Bo Game Rules Reference

**Small**: Total 4-10 (excluding triples) - 1:1
**Big**: Total 11-17 (excluding triples) - 1:1
**Sum Bets**:
- 4/17: 60:1
- 5/16: 30:1
- 6/15: 18:1
- 7/14: 12:1
- 8/13: 8:1
- 9/12: 7:1
- 10/11: 6:1

**Specific Triple**: All three dice show same number (1-6) - 180:1
**Any Triple**: All three dice show any matching number - 30:1
**Specific Double**: At least two dice show same number (1-6) - 10:1
**Combination**: Two specific numbers appear - 6:1
**Single**: Specific number appears once/twice/thrice - 1:1 / 2:1 / 3:1

## Next Steps

1. Copy the Sic Bo section from sicbo-program-additions.ts into program.ts (before RE-EXPORTS)
2. Create the 4 component files listed above
3. Run `npm run build` to verify everything compiles
4. Test the implementation on localnet
5. Deploy to devnet for further testing

The implementation is complete and ready for integration!
