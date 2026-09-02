import type {
  AddLibraryEntryVersionRequest,
  ArchiveLibraryEntryRequest,
  CreateLibraryEntryRequest,
  LibraryEntryDetail,
  LibraryListResponse,
  UpdateLibraryEntryMetadataRequest,
} from '@crypto-strategy-lab/shared';

import { browserHttpClient } from '../../../shared/api/browserHttpClient';

export interface ValidateStrategyResult {
  valid: boolean;
  message?: string;
}

export interface ListLibraryOptions {
  limit?: number;
  offset?: number;
  archived?: boolean;
}

export interface StrategyLibraryClient {
  list(options?: ListLibraryOptions): Promise<LibraryListResponse>;
  get(id: string): Promise<LibraryEntryDetail>;
  create(request: CreateLibraryEntryRequest): Promise<LibraryEntryDetail>;
  updateMetadata(
    id: string,
    request: UpdateLibraryEntryMetadataRequest,
  ): Promise<LibraryEntryDetail>;
  addVersion(
    id: string,
    request: AddLibraryEntryVersionRequest,
  ): Promise<LibraryEntryDetail>;
  archive(
    id: string,
    request: ArchiveLibraryEntryRequest,
  ): Promise<LibraryEntryDetail>;
  validate(params: unknown): Promise<ValidateStrategyResult>;
}

function toQuery(options: ListLibraryOptions): string {
  const query = new URLSearchParams();
  if (options.limit !== undefined) query.set('limit', String(options.limit));
  if (options.offset !== undefined) query.set('offset', String(options.offset));
  if (options.archived !== undefined) {
    query.set('archived', String(options.archived));
  }
  const search = query.toString();
  return search.length === 0 ? '' : `?${search}`;
}

export const strategyLibraryClient: StrategyLibraryClient = {
  list: (options = {}) =>
    browserHttpClient<LibraryListResponse>(
      `/api/v1/strategies${toQuery(options)}`,
    ),
  get: (id) =>
    browserHttpClient<LibraryEntryDetail>(`/api/v1/strategies/${id}`),
  create: (request) =>
    browserHttpClient<LibraryEntryDetail>('/api/v1/strategies', {
      method: 'POST',
      body: JSON.stringify(request),
    }),
  updateMetadata: (id, request) =>
    browserHttpClient<LibraryEntryDetail>(`/api/v1/strategies/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(request),
    }),
  addVersion: (id, request) =>
    browserHttpClient<LibraryEntryDetail>(`/api/v1/strategies/${id}/versions`, {
      method: 'POST',
      body: JSON.stringify(request),
    }),
  archive: (id, request) =>
    browserHttpClient<LibraryEntryDetail>(`/api/v1/strategies/${id}/archive`, {
      method: 'PATCH',
      body: JSON.stringify(request),
    }),
  validate: (params) =>
    browserHttpClient<ValidateStrategyResult>('/api/v1/strategies/validate', {
      method: 'POST',
      body: JSON.stringify({ params }),
    }),
};
