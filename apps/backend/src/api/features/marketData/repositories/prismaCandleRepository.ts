import type { Candle } from '@crypto-strategy-lab/shared';

import type { AppPrismaClient } from '../../../../database/prismaClient';
import type { CandleRepository } from '../application/interfaces/candleRepository.interface';

export class PrismaCandleRepository implements CandleRepository {
  public constructor(private readonly prisma: AppPrismaClient) {}

  public async upsertClosed(candle: Candle): Promise<void> {
    const openTime = BigInt(candle.openTime);
    await this.prisma.candle.upsert({
      where: {
        pair_timeframe_openTime: {
          pair: candle.pair,
          timeframe: candle.timeframe,
          openTime,
        },
      },
      create: toPersistence(candle),
      update: toPersistence(candle),
    });
  }
}

function toPersistence(candle: Candle) {
  return {
    pair: candle.pair,
    timeframe: candle.timeframe,
    openTime: BigInt(candle.openTime),
    closeTime: BigInt(candle.closeTime),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    isClosed: true,
  };
}
