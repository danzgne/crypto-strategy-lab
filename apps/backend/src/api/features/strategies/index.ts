export { registerStrategyGateway } from './realtime/strategyGateway';
export {
  StrategyLiveService,
  type StrategyDomainEventBus,
  type StrategyErrorListener,
  type StrategySignalListener,
  type StrategySubscription,
  type StrategySubscriptionRequest,
} from './services/strategyLiveService';

export {
  StrategyGenerationService,
  type GenerateStrategyInput,
  type GenerateStrategyResult,
} from './generation/strategyGenerationService';
export { STRATEGY_GENERATION_CONSUMER_ID } from './generation/prompt';
export {
  StrategyLibraryService,
  StrategyLibraryValidationError,
  type AddVersionInput,
  type LibraryListResult,
  type ValidateStrategyResult,
} from './services/strategyLibraryService';
export { PrismaStrategyLibraryRepository } from './repositories/prismaStrategyLibraryRepository';
export type {
  StrategyLibraryRepository,
  LibraryEntryRow,
  LibraryEntryDetailRow,
  LibraryVersionForOwner,
} from './repositories/interfaces/strategyLibraryRepository.interface';
export { StrategyGenerationController } from './controllers/strategyGenerationController';
export { StrategyLibraryController } from './controllers/strategyLibraryController';
export { createStrategiesFeatureRouter } from './routes/v1/strategies.routes';
