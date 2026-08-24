import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { DashboardShell } from '../../features/dashboard';
import { authServer } from '../../features/auth/api/authServer';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await authServer.getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  // Provide user to dashboard components down the line if needed, or rely on client fetching
  // For now, wrapping the shell is enough.
  return <DashboardShell user={user}>{children}</DashboardShell>;
}
