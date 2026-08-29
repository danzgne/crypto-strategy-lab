'use client';

import { useState } from 'react';

export function SelfHealingDiagramPanel({
  isAdmin = false,
}: {
  isAdmin?: boolean;
}) {
  const [autoEnabled, setAutoEnabled] = useState(true);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 className="text-sm font-bold text-slate-900">
          Self-healing extraction
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">
            Tự động bật
          </span>
          {isAdmin ? (
            <button
              type="button"
              role="switch"
              aria-checked={autoEnabled}
              onClick={() => setAutoEnabled(!autoEnabled)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                autoEnabled ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  autoEnabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          ) : (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
              Đang bật
            </span>
          )}
        </div>
      </div>

      {/* 4-Step Diagram */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {/* Step 1 */}
        <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
              1
            </span>
            <span className="text-xs font-bold text-slate-800">
              Validate kết quả
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Kiểm tra chất lượng kết quả trích xuất
          </p>

          <div className="mt-2.5 flex-1 rounded-lg border border-slate-200 bg-white p-2.5 text-[11px]">
            <p className="font-semibold text-slate-700">Chỉ số hiện tại:</p>
            <div className="mt-1.5 space-y-1 text-[10px] text-slate-600">
              <div className="flex justify-between">
                <span>Fields rỗng:</span>
                <span className="font-semibold text-rose-600">8.7%</span>
              </div>
              <div className="flex justify-between">
                <span>Sai định dạng:</span>
                <span className="font-semibold text-amber-600">3.2%</span>
              </div>
              <div className="flex justify-between">
                <span>Độ tin cậy TB:</span>
                <span className="font-semibold text-slate-700">0.76</span>
              </div>
            </div>
            <div className="mt-2.5 border-t border-slate-100 pt-1.5 flex justify-between text-[11px] font-bold">
              <span>Tổng lỗi:</span>
              <span className="text-rose-600">11.9%</span>
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
              2
            </span>
            <span className="text-xs font-bold text-slate-800">Lỗi cao?</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Nếu lỗi &gt; ngưỡng (VD: 10%)
          </p>

          <div className="mt-2.5 flex-1 flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span>Không</span>
              <span className="text-xs">→</span>
            </div>

            <div className="my-2 rotate-45 rounded-lg border-2 border-rose-400 bg-rose-50 px-3 py-1 shadow-sm">
              <span className="-rotate-45 block text-center text-[10px] font-bold text-rose-700 whitespace-nowrap">
                Lỗi cao?
              </span>
            </div>

            <div className="flex flex-col items-center text-[10px] text-slate-500 font-medium">
              <span>Có</span>
              <span className="text-xs">↓</span>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
              3
            </span>
            <span className="text-xs font-bold text-slate-800">
              LLM sửa template
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            LLM phân tích lỗi &amp; đề xuất template mới
          </p>

          <div className="mt-2.5 flex-1 rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] flex flex-col justify-between">
            <div>
              <p className="font-semibold text-slate-700">
                Đề xuất template mới:
              </p>
              <p className="mt-1 font-mono text-[10px] font-bold text-blue-600">
                v1.4.3 (draft)
              </p>
              <div className="mt-1.5 space-y-1 text-[10px] text-slate-600">
                <p>
                  Giảm lỗi dự kiến:{' '}
                  <span className="font-semibold text-emerald-600">
                    11.9% → 4.1%
                  </span>
                </p>
                <p>
                  Độ tin cậy dự kiến:{' '}
                  <span className="font-semibold text-emerald-600">0.93</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              className="mt-2 rounded-lg border border-slate-200 bg-slate-50 py-1 text-center text-[10px] font-semibold text-slate-700 hover:bg-slate-100 transition"
            >
              Xem diff
            </button>
          </div>
        </div>

        {/* Step 4 */}
        <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
              4
            </span>
            <span className="text-xs font-bold text-slate-800">
              Lưu version mới
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Lưu và chuyển sang version mới
          </p>

          <div className="mt-2.5 flex-1 rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] flex flex-col justify-between">
            <div>
              <p className="font-semibold text-slate-700">Đã lưu thành công:</p>
              <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-center">
                <span className="font-bold text-emerald-800 text-xs">
                  v1.4.3
                </span>
                <p className="text-[9px] text-emerald-600 mt-0.5">
                  10:45 · 18/05/2025
                </p>
              </div>
            </div>

            {isAdmin ? (
              <button
                type="button"
                className="mt-2 rounded-lg bg-blue-600 py-1.5 text-center text-[10px] font-semibold text-white shadow-sm hover:bg-blue-700 transition"
              >
                Áp dụng ngay
              </button>
            ) : (
              <div className="mt-2 rounded-lg bg-slate-50 py-1 text-center text-[10px] font-medium text-slate-500 border border-slate-200">
                Tự động kích hoạt
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
