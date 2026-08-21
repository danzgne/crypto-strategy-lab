import type { ReactNode } from 'react';

import { DashboardShell } from '../../features/dashboard';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
