import { TIMEFRAMES } from '@crypto-strategy-lab/shared';
import { z } from 'zod';

const wireTimeframe = z.enum(TIMEFRAMES as [string, ...string[]]);

const wireOperator = z.enum(['<', '>', '<=', '>=']);

const wireRsiIndicator = z.object({
  name: z.literal('RSI'),
  as: z.string().nullable(),
  period: z.number().nullable(),
});

const wireSmaIndicator = z.object({
  name: z.literal('SMA'),
  as: z.string().nullable(),
  period: z.number().nullable(),
});

const wireBollingerBandsIndicator = z.object({
  name: z.literal('BollingerBands'),
  as: z.string().nullable(),
  period: z.number().nullable(),
  stdDev: z.number().nullable(),
});

const wireIndicator = z.discriminatedUnion('name', [
  wireRsiIndicator,
  wireSmaIndicator,
  wireBollingerBandsIndicator,
]);

const wireCondition = z.object({
  indicator: z.string(),
  operator: wireOperator,
  value: z.number().nullable(),
  indicatorRef: z.string().nullable(),
});

const wirePercentAmount = z.object({
  type: z.literal('percent'),
  value: z.number(),
});

const wireRiskManagement = z
  .object({
    stopLoss: wirePercentAmount.nullable(),
    takeProfit: wirePercentAmount.nullable(),
  })
  .nullable();

const wireApplicability = z
  .object({
    pairsMode: z.enum(['USDT_ALL', 'CUSTOM']),
    customPairs: z.array(z.string()).nullable(),
  })
  .nullable();

export const STRATEGY_GENERATION_WIRE_SCHEMA = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  indicators: z.array(wireIndicator),
  conditions: z.object({
    long: z.array(wireCondition),
    short: z.array(wireCondition),
  }),
  riskManagement: wireRiskManagement,
  timeframe: wireTimeframe,
  applicability: wireApplicability,
  unsupportedRequests: z.array(z.string()),
});

export type GenerationWireResponse = z.infer<
  typeof STRATEGY_GENERATION_WIRE_SCHEMA
>;
export type WireIndicator = z.infer<typeof wireIndicator>;
export type WireCondition = z.infer<typeof wireCondition>;
