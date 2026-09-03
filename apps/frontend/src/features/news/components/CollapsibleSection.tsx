'use client';

import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  badge,
  children,
}: CollapsibleSectionProps) {
  return (
    <details
      className="group rounded-xl border border-slate-200 open:bg-slate-50/40"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 select-none">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">{title}</span>
          {subtitle && (
            <span className="text-xs font-normal text-slate-400">
              {subtitle}
            </span>
          )}
          {badge}
        </div>
        <ChevronDown className="size-4 shrink-0 text-slate-400 transition-transform duration-150 group-open:rotate-180" />
      </summary>
      <div className="border-t border-slate-200 px-4 py-3">{children}</div>
    </details>
  );
}
