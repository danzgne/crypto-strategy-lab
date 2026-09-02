import type { SearchSpace } from '@crypto-strategy-lab/shared';

export const defaultSearchSpace: SearchSpace = {
  enabledStrategies: [{ id: 'ma' }],
  endTime: 1700000000000,
  pair: 'BTCUSDT',
  permittedCombinationModes: ['majority'],
  startTime: 1690000000000,
  timeframe: '1h',
};
