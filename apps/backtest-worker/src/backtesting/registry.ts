import { CURRENT_SIMULATION_RULES_VERSION } from '@crypto-strategy-lab/shared/backtest';

import { VersionRegistry, type VersionFactory } from '../versionRegistry';
import { HistoricalBacktester } from './historicalBacktester';
import type { Backtester } from './types';

export type BacktesterFactory = VersionFactory<Backtester>;

/**
 * Maps a Simulation Rules version to the Backtester implementation that executes it.
 */
export const BacktesterRegistry = new VersionRegistry<Backtester>(
  'Simulation Rules',
);

BacktesterRegistry.register(
  CURRENT_SIMULATION_RULES_VERSION,
  () => new HistoricalBacktester(),
);
