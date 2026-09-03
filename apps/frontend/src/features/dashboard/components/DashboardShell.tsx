'use client';

import {
  Activity,
  BarChart3,
  BookOpenText,
  FlaskConical,
  Search,
  Server,
  Settings,
} from 'lucide-react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

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
    href: '/strategy-engine',
    implemented: true,
  },
  { label: 'Discovery', icon: Search, href: '/discovery', implemented: true },
  { label: 'Backtest', icon: BarChart3, href: '/backtests', implemented: true },
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
  const [hovering, setHovering] = useState(false);
  const expanded = hovering;

  const navItems: NavItem[] = [
    ...navigation.slice(0, 5),
    ...(user?.role === 'ADMIN'
      ? [
          {
            label: 'Operations',
            icon: Server,
            href: '/admin/operations',
            implemented: true,
          },
        ]
      : []),
    ...navigation.slice(5),
  ];

  return (
    <AuthProvider initialUser={user}>
      <div className="min-h-screen bg-slate-50 text-slate-950 lg:grid lg:grid-cols-[84px_1fr]">
        <div aria-hidden="true" className="hidden lg:block" />

        <aside
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          className={`hidden border-r border-slate-200 bg-white px-3 py-6 shadow-xl shadow-slate-900/5 transition-[width] duration-200 ease-out lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:flex-col ${
            expanded ? 'lg:w-[248px] lg:px-5' : 'lg:w-[84px]'
          }`}
        >
          <div
            className={`flex items-center gap-3 px-2 ${expanded ? '' : 'justify-center px-0'}`}
          >
            <ProductLogoMark />
            <div className={`min-w-0 ${expanded ? '' : 'sr-only'}`}>
              <p className="truncate text-sm font-bold tracking-tight">
                Crypto Strategy
              </p>
              <p className="truncate text-sm font-bold tracking-tight text-indigo-600">
                Lab
              </p>
            </div>
          </div>

          <nav
            aria-label="Primary navigation"
            className="mt-10 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden"
          >
            {navItems.map(({ label, icon: Icon, href, implemented }) => {
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
                      expanded ? '' : 'justify-center px-0'
                    } ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-100'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon aria-hidden="true" className="size-5 shrink-0" />
                    <span className={expanded ? 'truncate' : 'sr-only'}>
                      {label}
                    </span>
                  </Link>
                );
              }

              return (
                <a
                  key={label}
                  href={href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 ${
                    expanded ? '' : 'justify-center px-0'
                  }`}
                >
                  <Icon aria-hidden="true" className="size-5 shrink-0" />
                  <span className={expanded ? 'truncate' : 'sr-only'}>
                    {label}
                  </span>
                  <span
                    className={`ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-400 ${
                      expanded ? '' : 'sr-only'
                    }`}
                  >
                    Soon
                  </span>
                </a>
              );
            })}
          </nav>

          {user && <UserMenu expanded={expanded} user={user} />}
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
