import type {
  ExtractionTemplate,
  NewsSource,
} from '@crypto-strategy-lab/shared';

export interface ActiveTemplateRecord {
  versionId: string;
  template: ExtractionTemplate;
}

/**
 * The one-method port WebsiteNewsProvider depends on, so it knows nothing about
 * Prisma, the LLM, or how a missing template gets one generated. Implemented by
 * ExtractionTemplateService, which does that IO behind this single call.
 */
export interface ActiveTemplatePort {
  getActiveTemplate(source: NewsSource): Promise<ActiveTemplateRecord | null>;
}
