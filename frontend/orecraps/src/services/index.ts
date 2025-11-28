export { TransactionService as LegacyTransactionService } from './LegacyTransactionService';
export { CrapsGameService } from './CrapsGameService';
export type { PlaceBetParams } from './CrapsGameService';

// New consolidated transaction service
export {
  TransactionService,
  createTransactionService,
  type TransactionResult,
  type SendTransactionOptions,
  type SimulateTransactionOptions,
  type PlaceBetParams as TransactionPlaceBetParams,
  type DeployParams,
  type SettleCrapsParams,
} from './transactionService';
