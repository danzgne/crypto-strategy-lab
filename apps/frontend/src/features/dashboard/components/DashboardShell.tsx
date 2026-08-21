import {
  Activity,
  BarChart3,
  BookOpenText,
  FlaskConical,
  LayoutDashboard,
  Search,
  Settings,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { ProductLogoMark } from './ProductLogoMark';

const navigation = [
  { label: 'Realtime', icon: Activity, active: true },
  { label: 'Strategy Engine', icon: FlaskConical },
  { label: 'Discovery', icon: Search },
  { label: 'Backtest', icon: BarChart3 },
  { label: 'News Crawler', icon: BookOpenText },
  { label: 'Settings', icon: Settings },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden min-h-screen border-r border-slate-200 bg-white px-5 py-6 lg:flex lg:flex-col">
        <div className="flex items-center gap-3 px-2">
          <ProductLogoMark />
          <div>
            <p className="text-sm font-bold tracking-tight">Crypto Strategy</p>
            <p className="text-sm font-bold tracking-tight text-indigo-600">
              Lab
            </p>
          </div>
        </div>

        <nav aria-label="Primary navigation" className="mt-10 space-y-1.5">
          {navigation.map(({ label, icon: Icon, active }) => (
            <a
              key={label}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                active
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-100'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
              href={
                active ? '/' : `#${label.toLowerCase().replaceAll(' ', '-')}`
              }
            >
              <Icon aria-hidden="true" className="size-5" />
              {label}
            </a>
          ))}
        </nav>

        <div className="mt-auto rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
            <LayoutDashboard aria-hidden="true" className="size-4" />
            Foundation milestone
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            Transport status is measured here. Worker and database readiness
            remain visible through Compose health checks.
          </p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4 lg:hidden">
          <div className="flex items-center gap-3">
            <ProductLogoMark />
            <span className="text-sm font-bold">Crypto Strategy Lab</span>
          </div>
          <Activity
            aria-label="Realtime dashboard"
            className="size-5 text-indigo-600"
          />
        </header>
        <main className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
