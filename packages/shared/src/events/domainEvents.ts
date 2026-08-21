import { randomUUID } from 'node:crypto';

export type Pair = string;
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface MarketPriceUpdatedPayload {
  pair: Pair;
  price: string;
  exchangeEventTime: string;
}

export interface CandleClosedPayload {
  pair: Pair;
  timeframe: Timeframe;
  openTime: string;
  closeTime: string;
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
  experimentId: string;
  candidateId: string;
  score: number;
}

export interface LeaderboardUpdatedPayload {
  userId: string;
  leaderboardEntryIds: string[];
}

export interface NewsCollectedPayload {
  newsItemId: string;
  provider: string;
}

export interface SentimentAnalyzedPayload {
  newsItemId: string;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  score: number;
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
  version: 1;
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
  StrategyEvaluated: 1,
  LeaderboardUpdated: 1,
  NewsCollected: 1,
  SentimentAnalyzed: 1,
} as const satisfies Record<DomainEventName, 1>;

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
