import type {
  BacktestHistoryResponse,
  BacktestResultResponse,
  BacktestSubmissionResponse,
} from '@crypto-strategy-lab/shared';

export interface BacktestServiceInterface {
  submit(
    ownerId: string,
    request: unknown,
  ): Promise<BacktestSubmissionResponse>;
  list(ownerId: string): Promise<BacktestHistoryResponse>;
  get(
    ownerId: string,
    experimentId: string,
  ): Promise<BacktestResultResponse | null>;
}
