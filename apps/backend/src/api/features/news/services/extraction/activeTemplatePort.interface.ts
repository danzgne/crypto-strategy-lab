import type {
  ExtractionTemplate,
  NewsSource,
} from '@crypto-strategy-lab/shared';

export interface ActiveTemplateRecord {
  versionId: string;
  template: ExtractionTemplate;
}

export interface ActiveTemplatePort {
  getActiveTemplate(source: NewsSource): Promise<ActiveTemplateRecord | null>;
}
