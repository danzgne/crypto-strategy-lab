'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, Loader2 } from 'lucide-react';

import type { ParamsValidationState } from '../hooks/useStrategyGeneration';

interface StrategyJsonPanelProps {
  paramsText: string;
  onChangeParamsText: (value: string) => void;
  validation: ParamsValidationState;
}

export function StrategyJsonPanel({
  paramsText,
  onChangeParamsText,
  validation,
}: StrategyJsonPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(paramsText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied by the browser; the JSON stays visible to copy by hand.
    }
  };

  const hasError =
    validation.status === 'invalid' || validation.status === 'syntax-error';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={isOpen}
      >
        <h3 className="text-sm font-bold text-slate-900">
          Định nghĩa strategy (JSON)
        </h3>
        {isOpen ? (
          <ChevronDown className="size-4 text-slate-400" />
        ) : (
          <ChevronRight className="size-4 text-slate-400" />
        )}
      </button>
      {isOpen && (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 text-xs">
              {validation.status === 'checking' && (
                <span className="inline-flex items-center gap-1.5 text-slate-500">
                  <Loader2 className="size-3.5 animate-spin" />
                  Đang kiểm tra...
                </span>
              )}
              {hasError && (
                <span
                  className="truncate text-rose-600"
                  title={validation.message}
                >
                  {validation.message}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            >
              {copied ? (
                <Check className="size-3.5 text-emerald-600" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copied ? 'Đã sao chép' : 'Sao chép'}
            </button>
          </div>
          <textarea
            value={paramsText}
            onChange={(event) => onChangeParamsText(event.target.value)}
            spellCheck={false}
            className={`mt-2 h-96 w-full resize-y overflow-auto rounded-xl border bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100 focus:outline-none ${
              hasError
                ? 'border-rose-500 focus:border-rose-500'
                : 'border-slate-800 focus:border-indigo-400'
            }`}
          />
        </div>
      )}
    </div>
  );
}
