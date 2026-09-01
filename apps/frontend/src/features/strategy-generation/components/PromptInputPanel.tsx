'use client';

import { AlertTriangle, Loader2, Sparkles, Trash2 } from 'lucide-react';

import { useConfirmGate } from '../hooks/useConfirmGate';

const MAX_PROMPT_LENGTH = 1000;

interface PromptInputPanelProps {
  promptText: string;
  onChangePromptText: (value: string) => void;
  onAnalyze: () => void;
  onClear: () => void;
  isAnalyzing: boolean;
  hasUnsavedEdits: boolean;
}

export function PromptInputPanel({
  promptText,
  onChangePromptText,
  onAnalyze,
  onClear,
  isAnalyzing,
  hasUnsavedEdits,
}: PromptInputPanelProps) {
  const { armed, trigger } = useConfirmGate(hasUnsavedEdits);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">Nhập mô tả strategy</h3>
      <textarea
        value={promptText}
        onChange={(event) =>
          onChangePromptText(event.target.value.slice(0, MAX_PROMPT_LENGTH))
        }
        maxLength={MAX_PROMPT_LENGTH}
        rows={7}
        disabled={isAnalyzing}
        placeholder="Khi RSI dưới 30 và giá nằm dưới Bollinger Lower Band thì LONG. Stop loss 2%, take profit 4%."
        className="mt-3 w-full resize-none rounded-xl border border-slate-200 p-3 text-sm text-slate-700 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none disabled:bg-slate-50"
      />
      <div className="mt-1 text-right text-xs text-slate-400">
        {promptText.length}/{MAX_PROMPT_LENGTH}
      </div>
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={() => trigger(onAnalyze)}
          disabled={isAnalyzing || promptText.trim().length === 0}
          className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-50 ${
            armed
              ? 'bg-amber-500 shadow-amber-100'
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-blue-100'
          }`}
        >
          {isAnalyzing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : armed ? (
            <AlertTriangle className="size-4" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {armed ? 'Nhấn lại để xác nhận' : 'Phân tích bằng LLM'}
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={isAnalyzing}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="size-4" />
          Xóa
        </button>
      </div>
    </div>
  );
}
