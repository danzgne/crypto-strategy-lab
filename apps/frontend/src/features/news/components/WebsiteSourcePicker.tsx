'use client';

import type { NewsSource } from '../types';

interface WebsiteSourcePickerProps {
  sources: NewsSource[];
  selectedSourceId: string | null;
  onSelect: (sourceId: string) => void;
}

export function WebsiteSourcePicker({
  sources,
  selectedSourceId,
  onSelect,
}: WebsiteSourcePickerProps) {
  if (sources.length === 0) {
    return (
      <span className="text-[11px] font-medium text-slate-400">
        No Website Sources yet
      </span>
    );
  }

  return (
    <select
      value={selectedSourceId ?? ''}
      onChange={(e) => onSelect(e.target.value)}
      aria-label="Select a Website Source"
      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      {sources.map((source) => (
        <option key={source.id} value={source.id}>
          {source.name}
        </option>
      ))}
    </select>
  );
}
