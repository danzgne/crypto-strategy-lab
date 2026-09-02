export type TemplateFieldName = 'title' | 'summary' | 'publishedAt' | 'url';

export const TEMPLATE_FIELD_NAMES: readonly TemplateFieldName[] = [
  'title',
  'summary',
  'publishedAt',
  'url',
];

export interface TemplateFieldLocator {
  selector: string;
  attr?: string | undefined;
}

export interface ExtractionTemplate {
  item: string;
  fields: Record<TemplateFieldName, TemplateFieldLocator>;
  confidence: number;
  notes?: string | undefined;
}

export const TEMPLATE_VERSION_STATUSES = [
  'PROPOSED',
  'ACTIVE',
  'SUPERSEDED',
  'REJECTED',
] as const;

export type TemplateVersionStatus = (typeof TEMPLATE_VERSION_STATUSES)[number];

export interface ExtractionTemplateVersion {
  id: string;
  newsSourceId: string;
  version: number;
  status: TemplateVersionStatus;
  template: ExtractionTemplate;
  confidence: number;
  generatedBy: string;
  basedOnVersionId?: string | null | undefined;
  projectedEmptyFieldRate?: number | null | undefined;
  projectedMalformedFieldRate?: number | null | undefined;
  activatedAt?: string | null | undefined;
  createdAt: string;
}

export interface TemplateApplicationMetrics {
  itemCount: number;
  emptyFieldRate: number;
  malformedFieldRate: number;
}

export type DriftStatus = 'INSUFFICIENT_DATA' | 'OK' | 'DRIFTED';

export interface DriftVerdict {
  status: DriftStatus;
  threshold: number;
  combinedRate: number | null;
  sampleAttempts: number;
  sampleItems: number;
}

export interface ExtractionSettings {
  driftDetectionEnabled: boolean;
  driftThreshold: number;
}

export interface SourceHealth {
  sourceId: string;
  enabled: boolean;
  active: boolean;
  lastAttemptAt?: string | null | undefined;
  lastAttemptStatus?: 'SUCCESS' | 'FAILURE' | null | undefined;
  avgConfidence24h: number | null;
  itemsAnalysed24h: number;
}

export interface ExtractionPanelData {
  source: {
    id: string;
    name: string;
    url: string;
    providerType: string;
    isActive: boolean;
  };
  activeVersion: ExtractionTemplateVersion | null;
  proposedVersion: ExtractionTemplateVersion | null;
  versionHistory: ExtractionTemplateVersion[];
  health: SourceHealth;
  drift: DriftVerdict;
  settings: ExtractionSettings;
}

export interface TemplatePreviewResult {
  items: {
    title: string;
    summary: string;
    publishedAt: string;
    url: string;
  }[];
  metrics: TemplateApplicationMetrics;
}

export interface TemplateGenerateResult {
  template: ExtractionTemplate;
  metrics: TemplateApplicationMetrics;
  generatedBy: string;
}
