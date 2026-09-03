import { redirect } from 'next/navigation';

import { authServer } from '../../../../features/auth/api/authServer';
import { OperationsDashboard } from '../../../../features/operations';

export const dynamic = 'force-dynamic';

export default async function OperationsPage() {
  const user = await authServer.getCurrentUser();

  if (!user) {
    redirect('/login');
    return null;
  }

  if (user.role !== 'ADMIN') {
    return (
      <div
        className="rounded-2xl border border-rose-200 bg-rose-50/70 p-8 text-center"
        data-testid="operations-forbidden-server-check"
      >
        <h2 className="text-lg font-bold text-rose-900">
          Access Restricted: Administrator Privileges Required
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-rose-700">
          You do not have permission to view backend operations and worker
          telemetry.
        </p>
      </div>
    );
  }

  return <OperationsDashboard />;
}
