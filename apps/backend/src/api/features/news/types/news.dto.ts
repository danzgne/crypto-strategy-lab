import { z } from 'zod';

export const createNewsSourceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  url: z.string().url('Must be a valid URL'),
  providerType: z.enum(['RSS', 'WEBSITE', 'HTML']),
  isActive: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export type CreateNewsSourceDto = z.infer<typeof createNewsSourceSchema>;

export const updateNewsSourceSchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().url().optional(),
  providerType: z.enum(['RSS', 'WEBSITE', 'HTML']).optional(),
  isActive: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export type UpdateNewsSourceDto = z.infer<typeof updateNewsSourceSchema>;

export const ingestHtmlSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  html: z.string().min(1, 'HTML content is required'),
  url: z.string().url().optional(),
  source: z.string().optional().default('HTML Ingest'),
  publishedAt: z.string().datetime().optional(),
  relatedCoins: z.array(z.string()).optional(),
});

export type IngestHtmlDto = z.infer<typeof ingestHtmlSchema>;

export const updateCrawlIntervalSchema = z.object({
  intervalMinutes: z.number().int().min(1).max(5),
});

export type UpdateCrawlIntervalDto = z.infer<typeof updateCrawlIntervalSchema>;

export const newsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  source: z.string().optional(),
  coin: z.string().optional(),
  providerType: z.enum(['RSS', 'WEBSITE', 'HTML'] as const).optional(),
});

export type NewsListQueryDto = z.infer<typeof newsListQuerySchema>;
