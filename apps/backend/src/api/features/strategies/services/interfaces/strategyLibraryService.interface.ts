import type {
  SaveStrategyRequest,
  SavedStrategy,
} from '@crypto-strategy-lab/shared';

export interface StrategyLibraryServiceInterface {
  list(ownerId: string): Promise<SavedStrategy[]>;
  save(ownerId: string, request: SaveStrategyRequest): Promise<SavedStrategy>;
}
