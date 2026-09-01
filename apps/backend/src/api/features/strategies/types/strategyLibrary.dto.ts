import { STRATEGY_PROVENANCES } from '@crypto-strategy-lab/shared';
import { z } from 'zod';

const compositeMemberSchema = z.object({
  strategyId: z.string().trim().min(1),
  params: z.unknown().optional(),
  weight: z.number().optional(),
});

export const compositeRequestSchema = z.object({
  mode: z.enum(['majority', 'weighted']),
  members: z.array(compositeMemberSchema).min(2),
  threshold: z.number().optional(),
  stopLoss: z.number().optional(),
  takeProfit: z.number().optional(),
});

const createLibraryEntryBaseSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  description: z.string().trim().max(2000).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  libraryVersion: z.string().trim().min(1).max(50).optional(),
  source: z.enum(STRATEGY_PROVENANCES),
  sourceInput: z.string().trim().max(4000).optional(),
});

export const createLibraryEntryRequestSchema = createLibraryEntryBaseSchema
  .extend({
    strategyId: z.string().trim().min(1),
    params: z.unknown().optional(),
    composite: compositeRequestSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.strategyId === 'composite' && value.composite === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'composite is required when strategyId is "composite"',
        path: ['composite'],
      });
    }
    if (value.strategyId !== 'composite' && value.composite !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'composite must be omitted unless strategyId is "composite"',
        path: ['composite'],
      });
    }
  });

export const addLibraryVersionRequestSchema = z.object({
  libraryVersion: z.string().trim().min(1).max(50),
  params: z.unknown().optional(),
  composite: compositeRequestSchema.optional(),
});

export const updateLibraryEntryMetadataRequestSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
});

export const archiveLibraryEntryRequestSchema = z.object({
  archived: z.boolean(),
});

export const validateStrategyRequestSchema = z.object({
  params: z.unknown(),
});

export const listLibraryEntriesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  archived: z.enum(['true', 'false']).optional(),
});
