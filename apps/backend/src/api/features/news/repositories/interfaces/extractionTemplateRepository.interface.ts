import type {
  ExtractionTemplate,
  ExtractionTemplateVersion,
} from '@crypto-strategy-lab/shared';

export interface NewExtractionVersionInput {
  newsSourceId: string;
  template: ExtractionTemplate;
  confidence: number;
  generatedBy: string;
  projectedEmptyFieldRate?: number | null | undefined;
  projectedMalformedFieldRate?: number | null | undefined;
}

export interface ExtractionAttemptSample {
  itemsFound: number;
  emptyFieldRate: number;
  malformedFieldRate: number;
}

export interface Trailing24hExtractionStats {
  avgConfidence: number | null;
  itemsAnalysed: number;
}

export interface ExtractionTemplateRepository {
  getActiveVersion(sourceId: string): Promise<ExtractionTemplateVersion | null>;
  getProposedVersion(
    sourceId: string,
  ): Promise<ExtractionTemplateVersion | null>;
  listVersions(
    sourceId: string,
    limit?: number,
  ): Promise<ExtractionTemplateVersion[]>;
  getVersionById(
    sourceId: string,
    versionId: string,
  ): Promise<ExtractionTemplateVersion | null>;

  /** Creates version 1, ACTIVE immediately: it replaces nothing, so nothing to diff against. */
  createActiveVersion(
    input: NewExtractionVersionInput,
  ): Promise<ExtractionTemplateVersion>;

  createProposedVersion(
    input: NewExtractionVersionInput & { basedOnVersionId: string },
  ): Promise<ExtractionTemplateVersion>;

  /** Demotes the current ACTIVE (if any) to SUPERSEDED and promotes the target, in one transaction. */
  activateVersion(
    sourceId: string,
    versionId: string,
    now: Date,
  ): Promise<ExtractionTemplateVersion>;

  rejectVersion(
    sourceId: string,
    versionId: string,
  ): Promise<ExtractionTemplateVersion>;

  getAttemptsForVersionSince(
    templateVersionId: string,
    since: Date,
  ): Promise<ExtractionAttemptSample[]>;

  getTrailing24hStats(
    sourceId: string,
    now: Date,
  ): Promise<Trailing24hExtractionStats>;
}
