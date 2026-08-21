import type { ReactNode } from 'react';

const TONE_CLASSES = {
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  positive: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  negative: 'bg-rose-50 text-rose-700 ring-rose-200',
} as const;

interface StatusBadgeProperties {
  children: ReactNode;
  tone?: keyof typeof TONE_CLASSES;
  pulse?: boolean;
  testId?: string;
}

export function StatusBadge({
  children,
  tone = 'neutral',
  pulse = false,
  testId,
}: StatusBadgeProperties) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${TONE_CLASSES[tone]}`}
      data-testid={testId}
    >
      <span className="relative flex size-2">
        {pulse ? (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-30" />
        ) : null}
        <span className="relative inline-flex size-2 rounded-full bg-current" />
      </span>
      {children}
    </span>
  );
}
