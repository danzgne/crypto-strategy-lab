import type { ReactNode } from 'react';

import { DashboardShell } from '../../shared/layout/DashboardShell';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
