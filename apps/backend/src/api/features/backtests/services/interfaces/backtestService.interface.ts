import type {
  BacktestResultResponse,
  BacktestSubmissionResponse,
} from '@crypto-strategy-lab/shared';

export interface BacktestServiceInterface {
  submit(
    ownerId: string,
    request: unknown,
  ): Promise<BacktestSubmissionResponse>;
  get(
    ownerId: string,
    experimentId: string,
  ): Promise<BacktestResultResponse | null>;
}
