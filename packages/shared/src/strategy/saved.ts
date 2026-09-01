import type { CompositeStrategyRequest } from '../realtime/transport';

export type SavedStrategyParams = Readonly<Record<string, unknown>>;

export interface SavedStrategyBase {
  id: string;
  versionId: string;
  name: string;
  description: string | null;
  createdAt: string;
}

export interface SavedSingularStrategy extends SavedStrategyBase {
  kind: 'singular';
  strategyId: string;
  params: SavedStrategyParams;
}

export interface SavedCompositeStrategy extends SavedStrategyBase {
  kind: 'composite';
  strategyId: 'composite';
  composite: CompositeStrategyRequest;
}

export type SavedStrategy = SavedSingularStrategy | SavedCompositeStrategy;

export interface SaveSingularStrategyRequest {
  name: string;
  description?: string;
  strategyId: string;
  params?: SavedStrategyParams;
  composite?: never;
}

export interface SaveCompositeStrategyRequest {
  name: string;
  description?: string;
  strategyId: 'composite';
  composite: CompositeStrategyRequest;
  params?: never;
}

export type SaveStrategyRequest =
  SaveSingularStrategyRequest | SaveCompositeStrategyRequest;
