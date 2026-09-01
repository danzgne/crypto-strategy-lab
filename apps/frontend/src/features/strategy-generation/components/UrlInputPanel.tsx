'use client';

import { AlertTriangle, Globe, Loader2 } from 'lucide-react';

import { useConfirmGate } from '../hooks/useConfirmGate';

interface UrlInputPanelProps {
  urlText: string;
  onChangeUrlText: (value: string) => void;
  onExtract: () => void;
  isExtracting: boolean;
  hasUnsavedEdits: boolean;
}

export function UrlInputPanel({
  urlText,
  onChangeUrlText,
  onExtract,
  isExtracting,
  hasUnsavedEdits,
}: UrlInputPanelProps) {
  const { armed, trigger } = useConfirmGate(hasUnsavedEdits);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">Nhập URL chiến lược</h3>
      <input
        type="url"
        value={urlText}
        onChange={(event) => onChangeUrlText(event.target.value)}
        disabled={isExtracting}
        placeholder="https://www.tradingview.com/script/abc123-example/"
        className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-700 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none disabled:bg-slate-50"
      />
      <p className="mt-2 text-xs text-slate-400">
        Hỗ trợ: TradingView, Blogger, Medium, GitHub Gist, Docs...
      </p>
      <button
        type="button"
        onClick={() => trigger(onExtract)}
        disabled={isExtracting || urlText.trim().length === 0}
        className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
          armed
            ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
            : 'border-slate-200 text-slate-700 hover:bg-slate-50'
        }`}
      >
        {isExtracting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : armed ? (
          <AlertTriangle className="size-4" />
        ) : (
          <Globe className="size-4" />
        )}
        {armed ? 'Nhấn lại để xác nhận' : 'Trích xuất từ website'}
      </button>
    </div>
  );
}
