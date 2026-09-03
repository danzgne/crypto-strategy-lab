import type { OperationsSnapshot } from '@crypto-strategy-lab/shared';
import { browserHttpClient } from '../../../shared/api/browserHttpClient';

export async function fetchOperationsSnapshot(): Promise<OperationsSnapshot> {
  return browserHttpClient<OperationsSnapshot>('/api/v1/admin/operations');
}
