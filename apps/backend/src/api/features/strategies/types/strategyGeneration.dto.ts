import type { RuleStrategyParams } from '@crypto-strategy-lab/shared';
import { z } from 'zod';

export const generateStrategyRequestSchema = z.object({
  kind: z.enum(['USER_PROMPT', 'WEB_IMPORT']),
  input: z
    .string()
    .trim()
    .min(1, 'Input is required')
    .max(4000, 'Input must be at most 4000 characters'),
});

export type GenerateStrategyRequestDto = z.infer<
  typeof generateStrategyRequestSchema
>;

export interface GenerateStrategyResponseDto {
  name: string;
  description: string;
  tags: string[];
  params: RuleStrategyParams;
  unsupportedRequests: string[];
  generatedBy: string;
}
