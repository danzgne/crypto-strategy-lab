import type { StrategyLibrarySummary } from '../types';

interface RecentlyImportedTableProps {
  entries: StrategyLibrarySummary[];
  isLoading: boolean;
}

export function RecentlyImportedTable({
  entries,
  isLoading,
}: RecentlyImportedTableProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">
        Chiến lược đã import gần đây
      </h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-slate-400">
              <th className="pb-2 pr-4 font-medium">Tên strategy</th>
              <th className="pb-2 pr-4 font-medium">Source</th>
              <th className="pb-2 pr-4 font-medium">Ngày tạo</th>
              <th className="pb-2 pr-4 font-medium">Version</th>
              <th className="pb-2 font-medium">Tags</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400">
                  Đang tải...
                </td>
              </tr>
            )}
            {!isLoading && entries.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400">
                  Chưa có strategy nào được import
                </td>
              </tr>
            )}
            {entries.map((entry) => (
              <tr
                key={entry.id}
                className="border-b border-slate-50 last:border-0"
              >
                <td className="py-2.5 pr-4 font-medium text-slate-800">
                  {entry.name}
                </td>
                <td className="py-2.5 pr-4">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      entry.source === 'USER_PROMPT'
                        ? 'bg-indigo-50 text-indigo-600'
                        : 'bg-sky-50 text-sky-600'
                    }`}
                  >
                    {entry.source}
                  </span>
                </td>
                <td className="py-2.5 pr-4 text-slate-500">
                  {formatDate(entry.createdAt)}
                </td>
                <td className="py-2.5 pr-4 text-slate-500">
                  {entry.libraryVersion}
                </td>
                <td className="py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {entry.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN');
}
