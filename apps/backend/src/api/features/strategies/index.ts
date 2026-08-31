export { registerStrategyGateway } from './realtime/strategyGateway';
export {
  StrategyLiveService,
  type StrategyDomainEventBus,
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
  type SaveStrategyInput,
  type SaveStrategyResult,
} from './services/strategyLibraryService';
export { PrismaStrategyLibraryRepository } from './repositories/prismaStrategyLibraryRepository';
export type {
  StrategyLibraryRepository,
  StrategyLibraryEntry,
} from './repositories/interfaces/strategyLibraryRepository.interface';
export { StrategyGenerationController } from './controllers/strategyGenerationController';
export { StrategyLibraryController } from './controllers/strategyLibraryController';
export { createStrategiesFeatureRouter } from './routes/v1/strategies.routes';
