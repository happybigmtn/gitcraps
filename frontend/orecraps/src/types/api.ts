/**
 * Shared API Type Definitions for OreCraps
 *
 * This file contains request and response types for all API endpoints.
 * Use these types to ensure type safety between API routes and client code.
 */

// ============================================================================
// Common Types
// ============================================================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  error?: string;
  message?: string;
  data?: T;
}

/**
 * Dice roll result
 */
export interface DiceResult {
  die1: number;
  die2: number;
  sum: number;
}

/**
 * Extended dice result with winning square
 */
export interface DiceResultWithSquare extends DiceResult {
  winningSquare: number;
}

/**
 * Network type for API requests
 */
export type NetworkType = 'localnet' | 'devnet' | 'mainnet-beta';

// ============================================================================
// /api/entropy
// ============================================================================

/**
 * Entropy action types
 */
export type EntropyAction = 'open' | 'sample' | 'reveal' | 'full-cycle' | 'status';

/**
 * POST /api/entropy - Request
 */
export interface EntropyRequest {
  action?: EntropyAction;
  network?: NetworkType;
}

/**
 * POST /api/entropy - Response (common fields)
 */
export interface EntropyResponseBase {
  success: boolean;
  error?: string;
  action?: EntropyAction;
}

/**
 * POST /api/entropy - Open action response
 */
export interface EntropyOpenResponse extends EntropyResponseBase {
  action: 'open';
  signature?: string;
  varAddress?: string;
  endAt?: number;
  commit?: string;
}

/**
 * POST /api/entropy - Sample action response
 */
export interface EntropySampleResponse extends EntropyResponseBase {
  action: 'sample';
  signature?: string;
  message?: string;
  slotHash?: string;
  currentSlot?: number;
  endAt?: number;
}

/**
 * POST /api/entropy - Reveal action response
 */
export interface EntropyRevealResponse extends EntropyResponseBase {
  action: 'reveal';
  signature?: string;
  value?: string;
  diceResult?: DiceResultWithSquare | null;
  message?: string;
}

/**
 * POST /api/entropy - Full cycle response
 */
export interface EntropyFullCycleResponse extends EntropyResponseBase {
  action: 'full-cycle';
  results?: string[];
  varId?: number;
  varAddress?: string;
  diceResult?: DiceResultWithSquare | null;
}

/**
 * POST /api/entropy - Status action response
 */
export interface EntropyStatusResponse extends EntropyResponseBase {
  action: 'status';
  exists: boolean;
  varAddress?: string;
  currentSlot?: number;
  endAt?: number;
  readyForSample?: boolean;
  sampled?: boolean;
  revealed?: boolean;
  hasSeedStored?: boolean;
  slotHash?: string;
  value?: string;
  diceResult?: DiceResultWithSquare | null;
}

/**
 * Union type for all entropy responses
 */
export type EntropyResponse =
  | EntropyOpenResponse
  | EntropySampleResponse
  | EntropyRevealResponse
  | EntropyFullCycleResponse
  | EntropyStatusResponse;

// ============================================================================
// /api/place-bet
// ============================================================================

/**
 * Bet type definition
 */
export interface BetInput {
  betType: number;
  point: number;
  amount: number;
}

/**
 * POST /api/place-bet - Request
 */
export interface PlaceBetRequest {
  bets: BetInput[];
  network?: NetworkType;
}

/**
 * POST /api/place-bet - Response
 */
export interface PlaceBetResponse {
  success: boolean;
  error?: string;
  signature?: string;
  payer?: string;
  betsPlaced?: number;
}

// ============================================================================
// /api/settle-round
// ============================================================================

/**
 * POST /api/settle-round - Request
 */
export interface SettleRoundRequest {
  network?: NetworkType;
}

/**
 * POST /api/settle-round - Response
 */
export interface SettleRoundResponse {
  success: boolean;
  error?: string;
  message?: string;
  signature?: string | null;
  diceResults?: DiceResult | null;
  winningSquare?: number | null;
  output?: string;
}

// ============================================================================
// /api/start-round
// ============================================================================

/**
 * POST /api/start-round - Request
 */
export interface StartRoundRequest {
  duration?: number;
  network?: NetworkType;
  simulated?: boolean;
}

/**
 * Roll result for simulated rounds
 */
export interface RollResult extends DiceResult {
  square: number;
}

/**
 * POST /api/start-round - Response
 */
export interface StartRoundResponse {
  success: boolean;
  error?: string;
  message?: string;
  signature?: string;
  output?: string;
  simulated?: boolean;
  roll?: RollResult;
}

// ============================================================================
// /api/faucet
// ============================================================================

/**
 * POST /api/faucet - Request
 */
export interface FaucetRequest {
  wallet: string;
  network: NetworkType;
}

/**
 * POST /api/faucet - Response
 */
export interface FaucetResponse {
  success: boolean;
  error?: string;
  message?: string;
  signature?: string | null;
  amount?: string;
  mint?: string;
}

// ============================================================================
// /api/localnet
// ============================================================================

/**
 * Localnet action types
 */
export type LocalnetAction = 'start' | 'stop' | 'setup' | 'status';

/**
 * GET /api/localnet - Response
 */
export interface LocalnetStatusResponse {
  running: boolean;
  healthy: boolean;
  version?: string;
  rpcUrl: string;
}

/**
 * POST /api/localnet - Request
 */
export interface LocalnetRequest {
  action: LocalnetAction;
}

/**
 * POST /api/localnet - Response
 */
export interface LocalnetResponse {
  success: boolean;
  error?: string;
  message?: string;
  output?: string;
  running?: boolean;
  healthy?: boolean;
  version?: string;
}

// ============================================================================
// /api/localnet-reset
// ============================================================================

/**
 * POST /api/localnet-reset - Request
 */
export interface LocalnetResetRequest {
  network?: NetworkType;
}

/**
 * POST /api/localnet-reset - Response
 */
export interface LocalnetResetResponse {
  success: boolean;
  error?: string;
  message?: string;
  diceResults?: DiceResult;
  winningSquare?: number;
  slotHash?: string;
  note?: string;
  simulated?: boolean;
  varAddress?: string;
}

// ============================================================================
// /api/reset-round
// ============================================================================

/**
 * POST /api/reset-round - Response
 */
export interface ResetRoundResponse {
  success: boolean;
  error?: string;
  message?: string;
  signature?: string | null;
  output?: string;
  details?: string;
}

// ============================================================================
// /api/simulate-roll
// ============================================================================

/**
 * Extended dice result with hardway flag
 */
export interface DiceResultExtended extends DiceResult {
  isHardway: boolean;
}

/**
 * Bet outcome for a specific bet type
 */
export interface BetOutcome {
  wins: boolean;
  reason: string;
}

/**
 * POST /api/simulate-roll - Request
 */
export interface SimulateRollRequest {
  network?: NetworkType;
}

/**
 * POST /api/simulate-roll - Response
 */
export interface SimulateRollResponse {
  success: boolean;
  error?: string;
  simulated: boolean;
  diceResults: DiceResultExtended;
  winningSquare: number;
  outcomes: Record<string, BetOutcome>;
  message: string;
}

// ============================================================================
// /api/get-round-result
// ============================================================================

/**
 * GET /api/get-round-result - Response (no result yet)
 */
export interface RoundResultPendingResponse {
  success: boolean;
  hasResult: false;
  roundId: string;
  message: string;
  error?: string;
}

/**
 * GET /api/get-round-result - Response (with result)
 */
export interface RoundResultSuccessResponse {
  success: boolean;
  hasResult: true;
  roundId: string;
  winningSquare: number;
  diceResults: [number, number];
  diceSum: number;
}

/**
 * Union type for round result responses
 */
export type GetRoundResultResponse = RoundResultPendingResponse | RoundResultSuccessResponse;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a response is an error response
 */
export function isErrorResponse(response: ApiResponse): response is ApiResponse & { error: string } {
  return !response.success && typeof response.error === 'string';
}

/**
 * Type guard to check if round result has been settled
 */
export function isRoundResultSettled(
  response: GetRoundResultResponse
): response is RoundResultSuccessResponse {
  return response.hasResult === true;
}

/**
 * Type guard to check if start-round response is simulated
 */
export function isSimulatedStartRound(
  response: StartRoundResponse
): response is StartRoundResponse & { simulated: true; roll: RollResult } {
  return response.simulated === true && response.roll !== undefined;
}
