'use client';

import { CheckCircle2, ChevronRight } from 'lucide-react';

export function ExtractionDiagramPanel() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 className="text-sm font-bold text-slate-900">
          LLM-assisted Extraction
        </h3>
        <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
          <span>Template: v1.4.2</span>
          <CheckCircle2 className="size-3.5" />
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
            <span className="text-xs font-bold text-slate-800">HTML thô</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Thu thập nội dung HTML từ nguồn
          </p>

          <div className="mt-2.5 rounded-lg border border-slate-200 bg-slate-900 p-2 font-mono text-[10px] text-slate-300 leading-relaxed overflow-x-auto">
            <span className="text-slate-500">&lt;html&gt;</span>
            <br />
            <span className="text-slate-500">&lt;head&gt;...&lt;/head&gt;</span>
            <br />
            <span className="text-slate-500">&lt;body&gt;</span>
            <br />
            &nbsp;&nbsp;
            <span className="text-blue-400">
              &lt;div class=&quot;article&quot;&gt;
            </span>
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;
            <span className="text-emerald-400">&lt;h1&gt;</span>BlackRock&apos;s
            Bitcoin ETF...<span className="text-emerald-400">&lt;/h1&gt;</span>
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;
            <span className="text-amber-400">&lt;p&gt;</span>Dòng tiền vào các
            quỹ ETF...<span className="text-amber-400">&lt;/p&gt;</span>
            <br />
            &nbsp;&nbsp;<span className="text-blue-400">&lt;/div&gt;</span>
            <br />
            <span className="text-slate-500">&lt;/body&gt;</span>
            <br />
            <span className="text-slate-500">&lt;/html&gt;</span>
          </div>
        </div>

        {/* Step 2 */}
        <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
              2
            </span>
            <span className="text-xs font-bold text-slate-800">
              LLM hiểu tag HTML
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            LLM đọc &amp; hiểu cấu trúc, nhận diện vùng nội dung
          </p>

          <div className="mt-2.5 flex-1 rounded-lg border border-slate-200 bg-white p-2.5 text-[11px]">
            <p className="font-semibold text-slate-700">Nhận diện vùng:</p>
            <div className="mt-1.5 space-y-1 font-mono text-[10px] text-slate-600">
              <div className="flex justify-between">
                <span className="text-slate-500">title</span>
                <span className="text-blue-600">→ &lt;h1&gt;</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">summary</span>
                <span className="text-blue-600">
                  → &lt;p class=&quot;...&quot;&gt;
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">source</span>
                <span className="text-blue-600">
                  → &lt;span class=&quot;...&quot;&gt;
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">time</span>
                <span className="text-blue-600">→ &lt;time&gt;</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">asset</span>
                <span className="text-blue-600">→ context</span>
              </div>
            </div>
            <div className="mt-3 border-t border-slate-100 pt-1.5 text-[11px] font-bold text-emerald-600">
              Độ tin cậy: 0.92
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
              Sinh Extraction Template
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Tạo template trích xuất được đề xuất
          </p>

          <div className="mt-2.5 flex-1 rounded-lg border border-slate-200 bg-slate-900 p-2 font-mono text-[10px] text-slate-300 leading-relaxed overflow-x-auto">
            <span className="text-slate-500">{'{'}</span>
            <br />
            &nbsp;&nbsp;<span className="text-cyan-400">&quot;title&quot;</span>
            :{' '}
            <span className="text-emerald-300">
              &quot;h1.article-title&quot;
            </span>
            ,<br />
            &nbsp;&nbsp;
            <span className="text-cyan-400">&quot;summary&quot;</span>:{' '}
            <span className="text-emerald-300">&quot;p.summary&quot;</span>,
            <br />
            &nbsp;&nbsp;
            <span className="text-cyan-400">&quot;source&quot;</span>:{' '}
            <span className="text-emerald-300">&quot;span.source&quot;</span>,
            <br />
            &nbsp;&nbsp;<span className="text-cyan-400">
              &quot;time&quot;
            </span>: <span className="text-emerald-300">&quot;time&quot;</span>,
            <br />
            &nbsp;&nbsp;<span className="text-cyan-400">&quot;asset&quot;</span>
            :{' '}
            <span className="text-emerald-300">
              &quot;meta[content][\&quot;asset\&quot;]&quot;
            </span>
            <br />
            <span className="text-slate-500">{'}'}</span>
            <div className="mt-2 border-t border-slate-800 pt-1 text-[10px] text-emerald-400 font-sans font-semibold">
              Fields: 5 | Score: 0.92
            </div>
          </div>
        </div>

        {/* Step 4 */}
        <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
              4
            </span>
            <span className="text-xs font-bold text-slate-800">
              Lưu version template
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Lưu lại và quản lý các phiên bản
          </p>

          <div className="mt-2.5 flex-1 rounded-lg border border-slate-200 bg-white p-2 text-[11px] flex flex-col justify-between">
            <div>
              <p className="text-[11px] font-semibold text-slate-500">
                Các phiên bản:
              </p>
              <div className="mt-1.5 space-y-1.5">
                <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/60 px-2 py-1 text-[10px] font-medium text-emerald-900">
                  <div>
                    <span className="font-bold">v1.4.2</span> (Hiện tại)
                    <p className="text-[9px] text-emerald-700">
                      10:32 · 18/05/2025
                    </p>
                  </div>
                  <ChevronRight className="size-3 text-emerald-600" />
                </div>

                <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1 text-[10px] text-slate-600">
                  <span className="font-medium">v1.4.1</span>
                  <p className="text-[9px] text-slate-400">
                    09:10 · 17/05/2025
                  </p>
                </div>

                <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1 text-[10px] text-slate-600">
                  <span className="font-medium">v1.4.0</span>
                  <p className="text-[9px] text-slate-400">
                    16:22 · 16/05/2025
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="mt-2 text-center text-[10px] font-semibold text-blue-600 hover:text-blue-700"
            >
              Xem tất cả
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
