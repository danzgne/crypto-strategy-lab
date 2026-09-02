import { z } from 'zod';

const templateFieldSchema = z.object({
  selector: z.string().min(1),
  attr: z.string().min(1).optional(),
});

export const extractionTemplateSchema = z.object({
  item: z.string().min(1),
  fields: z.object({
    title: templateFieldSchema,
    summary: templateFieldSchema,
    publishedAt: templateFieldSchema,
    url: templateFieldSchema,
  }),
  confidence: z.number().min(0).max(1),
  notes: z.string().optional(),
});

export const previewTemplateSchema = z.object({
  html: z.string().min(1).optional(),
  template: extractionTemplateSchema.optional(),
});

export type PreviewTemplateDto = z.infer<typeof previewTemplateSchema>;

export const generateTemplateSchema = z.object({
  html: z.string().min(1).optional(),
});

export type GenerateTemplateDto = z.infer<typeof generateTemplateSchema>;

export const saveProposedVersionSchema = z.object({
  template: extractionTemplateSchema,
  generatedBy: z.string().min(1),
});

export type SaveProposedVersionDto = z.infer<typeof saveProposedVersionSchema>;

export const updateExtractionSettingsSchema = z.object({
  driftDetectionEnabled: z.boolean().optional(),
  driftThreshold: z.number().gt(0).lte(1).optional(),
});

export type UpdateExtractionSettingsDto = z.infer<
  typeof updateExtractionSettingsSchema
>;
