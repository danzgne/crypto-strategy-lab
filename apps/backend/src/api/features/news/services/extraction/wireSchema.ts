import { z } from 'zod';

const templateFieldWireSchema = z.object({
  selector: z.string().min(1),
  attr: z.string().nullable(),
});

export const EXTRACTION_TEMPLATE_WIRE_SCHEMA = z.object({
  item: z.string().min(1),
  fields: z.object({
    title: templateFieldWireSchema,
    summary: templateFieldWireSchema,
    publishedAt: templateFieldWireSchema,
    url: templateFieldWireSchema,
  }),
  confidence: z.number().min(0).max(1),
  notes: z.string().nullable(),
});

export type ExtractionTemplateWireResponse = z.infer<
  typeof EXTRACTION_TEMPLATE_WIRE_SCHEMA
>;
