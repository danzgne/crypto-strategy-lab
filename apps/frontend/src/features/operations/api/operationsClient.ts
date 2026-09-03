import type { OperationsSnapshot } from '@crypto-strategy-lab/shared';
import { browserHttpClient } from '../../../shared/api/browserHttpClient';

export async function fetchOperationsSnapshot(): Promise<OperationsSnapshot> {
  const timestamp = Date.now();
  return browserHttpClient<OperationsSnapshot>(
    `/api/v1/admin/operations?_t=${timestamp}`,
    {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    },
  );
}
