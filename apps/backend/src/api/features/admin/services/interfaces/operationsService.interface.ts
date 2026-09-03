import type { OperationsSnapshot } from '@crypto-strategy-lab/shared';

export interface OperationsServiceInterface {
  getSnapshot(): Promise<OperationsSnapshot>;
}
