import type {
  BacktestHistoryResponse,
  BacktestResultResponse,
  BacktestSubmissionRequest,
  BacktestSubmissionResponse,
} from '@crypto-strategy-lab/shared';

import { browserHttpClient } from '../../../shared/api/browserHttpClient';

export interface BacktestClient {
  list(): Promise<BacktestHistoryResponse>;
  submit(
    request: BacktestSubmissionRequest,
  ): Promise<BacktestSubmissionResponse>;
  get(experimentId: string): Promise<BacktestResultResponse>;
}

export const backtestClient: BacktestClient = {
  get: (experimentId) =>
    browserHttpClient<BacktestResultResponse>(
      `/api/v1/backtests/${encodeURIComponent(experimentId)}`,
    ),
  list: () => browserHttpClient<BacktestHistoryResponse>('/api/v1/backtests'),
  submit: (request) =>
    browserHttpClient<BacktestSubmissionResponse>('/api/v1/backtests', {
      body: JSON.stringify(request),
      method: 'POST',
    }),
};
