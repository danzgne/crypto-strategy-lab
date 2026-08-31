'use client';

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
import { usePathname } from 'next/navigation';
import Link from 'next/link';

import { ProductLogoMark } from './ProductLogoMark';
import { UserMenu } from '../../auth/components/UserMenu';
import { AuthProvider } from '../../auth/context/AuthContext';
import type { User } from '../../auth/types';

interface NavItem {
  label: string;
  icon: typeof Activity;
  href: string;
  implemented: boolean;
}

const navigation: NavItem[] = [
  { label: 'Realtime', icon: Activity, href: '/', implemented: true },
  {
    label: 'Strategy Engine',
    icon: FlaskConical,
    href: '#strategy-engine',
    implemented: false,
  },
  { label: 'Discovery', icon: Search, href: '#discovery', implemented: false },
  { label: 'Backtest', icon: BarChart3, href: '#backtest', implemented: false },
  {
    label: 'News Crawler',
    icon: BookOpenText,
    href: '/news',
    implemented: true,
  },
  { label: 'Settings', icon: Settings, href: '#settings', implemented: false },
];

export function DashboardShell({
  children,
  user,
}: {
  children: ReactNode;
  user?: User;
}) {
  const pathname = usePathname();

  return (
    <AuthProvider initialUser={user}>
      <div className="min-h-screen bg-slate-50 text-slate-950 lg:grid lg:grid-cols-[248px_1fr]">
        <aside className="hidden min-h-screen border-r border-slate-200 bg-white px-5 py-6 lg:flex lg:flex-col">
          <div className="flex items-center gap-3 px-2">
            <ProductLogoMark />
            <div>
              <p className="text-sm font-bold tracking-tight">
                Crypto Strategy
              </p>
              <p className="text-sm font-bold tracking-tight text-indigo-600">
                Lab
              </p>
            </div>
          </div>

          <nav aria-label="Primary navigation" className="mt-10 space-y-1.5">
            {navigation.map(({ label, icon: Icon, href, implemented }) => {
              const isActive =
                implemented &&
                (href === '/' ? pathname === '/' : pathname.startsWith(href));

              if (implemented) {
                return (
                  <Link
                    key={label}
                    href={href}
                    prefetch={false}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-100'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon aria-hidden="true" className="size-5" />
                    {label}
                  </Link>
                );
              }

              return (
                <a
                  key={label}
                  href={href}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition"
                >
                  <Icon aria-hidden="true" className="size-5" />
                  <span>{label}</span>
                  <span className="ml-auto text-[10px] rounded bg-slate-100 px-1.5 py-0.5 text-slate-400 font-normal">
                    Soon
                  </span>
                </a>
              );
            })}
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

          {user && <UserMenu user={user} />}
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
    </AuthProvider>
  );
}
