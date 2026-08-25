import type { Candle } from '@crypto-strategy-lab/shared';

export interface CandleRepository {
  upsertClosed(candle: Candle): Promise<void>;
}
