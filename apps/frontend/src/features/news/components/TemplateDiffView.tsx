'use client';

import type {
  ExtractionTemplate,
  TemplateFieldLocator,
  TemplateFieldName,
} from '../types';

interface TemplateDiffViewProps {
  active: ExtractionTemplate;
  proposed: ExtractionTemplate;
}

const TEMPLATE_FIELD_NAMES: TemplateFieldName[] = [
  'title',
  'summary',
  'publishedAt',
  'url',
];

function describeLocator(locator: TemplateFieldLocator | undefined): string {
  if (!locator) return '—';
  return locator.attr
    ? `${locator.selector} [${locator.attr}]`
    : locator.selector;
}

export function TemplateDiffView({ active, proposed }: TemplateDiffViewProps) {
  const rows: {
    field: string;
    activeValue: string;
    proposedValue: string;
    changed: boolean;
  }[] = [
    {
      field: 'item',
      activeValue: active.item,
      proposedValue: proposed.item,
      changed: active.item !== proposed.item,
    },
    ...TEMPLATE_FIELD_NAMES.map((field) => {
      const activeValue = describeLocator(active.fields[field]);
      const proposedValue = describeLocator(proposed.fields[field]);
      return {
        field,
        activeValue,
        proposedValue,
        changed: activeValue !== proposedValue,
      };
    }),
  ];

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-[11px]">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-2 py-1.5 font-semibold">Field</th>
            <th className="px-2 py-1.5 font-semibold">Active</th>
            <th className="px-2 py-1.5 font-semibold">Proposed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.field}
              className={`border-t border-slate-100 ${row.changed ? 'bg-amber-50' : ''}`}
            >
              <td className="px-2 py-1.5 font-mono font-semibold text-slate-700">
                {row.field}
              </td>
              <td className="px-2 py-1.5 font-mono text-slate-600">
                {row.activeValue}
              </td>
              <td
                className={`px-2 py-1.5 font-mono ${row.changed ? 'font-semibold text-amber-700' : 'text-slate-600'}`}
              >
                {row.proposedValue}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
