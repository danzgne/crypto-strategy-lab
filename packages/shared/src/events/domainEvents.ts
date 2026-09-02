import { randomUUID } from 'node:crypto';

export type { Pair, Timeframe } from '../marketData/candle';
import { isTimeframe, type Pair, type Timeframe } from '../marketData/candle';
import type { LeaderboardEntrySnapshot } from '../leaderboard/types';
import type { NewsEventType, SentimentLabel } from '../news/types';

export interface MarketPriceUpdatedPayload {
  pair: Pair;
  timeframe: Timeframe;
  openTime: number;
  price: string;
  exchangeEventTime: number;
}

export interface CandleClosedPayload {
  pair: Pair;
  timeframe: Timeframe;
  openTime: number;
  closeTime: number;
}

export interface StrategyGeneratedPayload {
  candidateId: string;
  searchRunId: string;
}

export interface BacktestStartedPayload {
  experimentId: string;
  jobId: string;
  workerId: string;
}

export interface BacktestCompletedPayload {
  experimentId: string;
  jobId: string;
}

export interface StrategyEvaluatedPayload {
  ownerId: string;
  experimentId: string;
  strategyVersionId: string;
  strategyKind: 'singular' | 'composite';
  strategyDisplayName: string;
  memberStrategies: {
    strategyId: string;
    label: string;
  }[];
  pair: Pair;
  timeframe: Timeframe;
  startTime: number;
  endTime: number;
  score: string;
  return: string;
  winRate: string;
  maxDrawdown: string;
  totalProfit: string;
  totalTrades: number;
}

/**
 * Runtime decoder for the persisted StrategyEvaluated contract.
 * Domain-event types are erased at runtime, so outbox consumers must validate
 * the JSON boundary before treating a payload as a typed event.
 */
export function isStrategyEvaluatedPayload(
  value: unknown,
): value is StrategyEvaluatedPayload {
  if (
    !isRecord(value) ||
    !isPair(value.pair) ||
    !isTimeframe(value.timeframe) ||
    !isNonEmptyString(value.ownerId) ||
    !isNonEmptyString(value.experimentId) ||
    !isNonEmptyString(value.strategyVersionId) ||
    !isNonEmptyString(value.strategyDisplayName) ||
    (value.strategyKind !== 'singular' && value.strategyKind !== 'composite') ||
    !Array.isArray(value.memberStrategies) ||
    !isSafeTimestamp(value.startTime) ||
    !isSafeTimestamp(value.endTime) ||
    !isDecimalString(value.score) ||
    !isDecimalString(value.return) ||
    !isDecimalString(value.winRate) ||
    !isDecimalString(value.maxDrawdown) ||
    !isDecimalString(value.totalProfit) ||
    typeof value.totalTrades !== 'number' ||
    !Number.isSafeInteger(value.totalTrades) ||
    value.totalTrades < 0
  ) {
    return false;
  }

  return value.memberStrategies.every(
    (member) =>
      isRecord(member) &&
      isNonEmptyString(member.strategyId) &&
      isNonEmptyString(member.label),
  );
}

export interface LeaderboardUpdatedPayload {
  userId: string;
  k: number;
  updatedAt: string;
  entries: LeaderboardEntrySnapshot[];
}

export interface NewsCollectedPayload {
  newsItemId: string;
  provider: string;
}

export interface SentimentAnalyzedPayload {
  newsItemId: string;
  sentiment: SentimentLabel;
  score: number;
  eventType: NewsEventType;
  relatedCoins: string[];
}

export interface DomainEventCatalog {
  MarketPriceUpdated: MarketPriceUpdatedPayload;
  CandleClosed: CandleClosedPayload;
  StrategyGenerated: StrategyGeneratedPayload;
  BacktestStarted: BacktestStartedPayload;
  BacktestCompleted: BacktestCompletedPayload;
  StrategyEvaluated: StrategyEvaluatedPayload;
  LeaderboardUpdated: LeaderboardUpdatedPayload;
  NewsCollected: NewsCollectedPayload;
  SentimentAnalyzed: SentimentAnalyzedPayload;
}

export type DomainEventName = keyof DomainEventCatalog;

export type DomainEventEnvelope<
  TName extends DomainEventName = DomainEventName,
> = {
  eventId: string;
  name: TName;
  version: 1 | 2;
  occurredAt: string;
  payload: DomainEventCatalog[TName];
};

export type AnyDomainEvent = {
  [TName in DomainEventName]: DomainEventEnvelope<TName>;
}[DomainEventName];

export const DOMAIN_EVENT_VERSIONS = {
  MarketPriceUpdated: 1,
  CandleClosed: 1,
  StrategyGenerated: 1,
  BacktestStarted: 1,
  BacktestCompleted: 1,
  StrategyEvaluated: 2,
  LeaderboardUpdated: 2,
  NewsCollected: 1,
  SentimentAnalyzed: 2,
} as const satisfies Record<DomainEventName, 1 | 2>;

interface EventMetadata {
  eventId?: string;
  occurredAt?: string;
}

export function createDomainEvent<TName extends DomainEventName>(
  name: TName,
  payload: DomainEventCatalog[TName],
  metadata: EventMetadata = {},
): DomainEventEnvelope<TName> {
  return {
    eventId: metadata.eventId ?? randomUUID(),
    name,
    version: DOMAIN_EVENT_VERSIONS[name],
    occurredAt: metadata.occurredAt ?? new Date().toISOString(),
    payload,
  };
}

function isPair(value: unknown): value is Pair {
  return (
    typeof value === 'string' &&
    value !== 'USDT' &&
    /^[A-Z0-9]+USDT$/.test(value)
  );
}

function isSafeTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDecimalString(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)
  ) {
    return false;
  }
  const exponent = /e([+-]?\d+)$/i.exec(value)?.[1];
  if (exponent === undefined) return true;
  const parsedExponent = Number(exponent);
  return (
    Number.isSafeInteger(parsedExponent) && Math.abs(parsedExponent) <= 1_000
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
