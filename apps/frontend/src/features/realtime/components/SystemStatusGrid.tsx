import { Check, Database, ServerCog, Workflow } from 'lucide-react';

const systems = [
  {
    label: 'Backend API',
    detail: 'Health and readiness routes',
    icon: ServerCog,
  },
  {
    label: 'PostgreSQL',
    detail: 'Prisma migration ready',
    icon: Database,
  },
  {
    label: 'Backtest worker',
    detail: 'Independent process heartbeat',
    icon: Workflow,
  },
];

export function SystemStatusGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {systems.map(({ label, detail, icon: Icon }) => (
        <article
          key={label}
          className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4"
        >
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
            <Icon aria-hidden="true" className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              {label}
              <Check aria-hidden="true" className="size-3.5 text-emerald-500" />
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500">{detail}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
