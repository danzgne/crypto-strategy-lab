import {
  STRATEGY_PROVENANCES,
  type RuleStrategyParams,
  type StrategyProvenance,
} from '@crypto-strategy-lab/shared';
import { z } from 'zod';

export const saveStrategyRequestSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  description: z.string().trim().max(2000).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  source: z.enum(STRATEGY_PROVENANCES),
  sourceInput: z.string().trim().min(1, 'Source input is required'),
  libraryVersion: z.string().trim().min(1).max(50).optional(),
  params: z.unknown(),
});

export type SaveStrategyRequestDto = z.infer<typeof saveStrategyRequestSchema>;

export const validateStrategyRequestSchema = z.object({
  params: z.unknown(),
});

export type ValidateStrategyRequestDto = z.infer<
  typeof validateStrategyRequestSchema
>;

export interface ValidateStrategyResponseDto {
  valid: boolean;
  message?: string;
}

export const listStrategiesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export type ListStrategiesQueryDto = z.infer<typeof listStrategiesQuerySchema>;

export interface StrategyLibraryVersionResponseDto {
  id: string;
  params: RuleStrategyParams;
  versionTag: string;
  libraryVersion: string;
}

export interface StrategyLibraryEntryResponseDto {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  source: StrategyProvenance;
  sourceInput: string;
  createdAt: string;
  version: StrategyLibraryVersionResponseDto;
}

export interface StrategyLibrarySummaryDto {
  id: string;
  name: string;
  source: StrategyProvenance;
  createdAt: string;
  libraryVersion: string;
  tags: string[];
}
