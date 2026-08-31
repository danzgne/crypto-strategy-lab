'use client';

import { useState, type ReactNode } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import type { StrategyProvenance } from '@crypto-strategy-lab/shared/strategy';

interface SaveStrategyPanelProps {
  disabled: boolean;
  source: StrategyProvenance | null;
  name: string;
  onChangeName: (value: string) => void;
  description: string;
  onChangeDescription: (value: string) => void;
  tags: string[];
  onChangeTags: (tags: string[]) => void;
  libraryVersion: string;
  onChangeLibraryVersion: (value: string) => void;
  isSaving: boolean;
  saveError: string | null;
  onSave: () => void;
}

export function SaveStrategyPanel({
  disabled,
  source,
  name,
  onChangeName,
  description,
  onChangeDescription,
  tags,
  onChangeTags,
  libraryVersion,
  onChangeLibraryVersion,
  isSaving,
  saveError,
  onSave,
}: SaveStrategyPanelProps) {
  const [tagDraft, setTagDraft] = useState('');

  const addTag = () => {
    const value = tagDraft.trim();
    if (value.length === 0 || tags.includes(value)) {
      setTagDraft('');
      return;
    }
    onChangeTags([...tags, value]);
    setTagDraft('');
  };

  const removeTag = (tag: string) => {
    onChangeTags(tags.filter((existing) => existing !== tag));
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">
        Lưu vào Strategy Library
      </h3>

      <fieldset
        disabled={disabled}
        className="mt-3 space-y-3 disabled:opacity-50"
      >
        <Field label="Name">
          <input
            type="text"
            value={name}
            onChange={(event) => onChangeName(event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(event) => onChangeDescription(event.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
          />
        </Field>

        <Field label="Version">
          <input
            type="text"
            value={libraryVersion}
            onChange={(event) => onChangeLibraryVersion(event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
          />
        </Field>

        <Field label="Tags">
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  aria-label={`Xóa tag ${tag}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={tagDraft}
              onChange={(event) => setTagDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ',') {
                  event.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
              placeholder="Thêm tag..."
              className="min-w-20 flex-1 border-none px-1 py-0.5 text-xs text-slate-700 focus:outline-none"
            />
          </div>
        </Field>

        <Field label="Source">
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {source ?? '—'}
          </span>
          <p className="mt-1 text-[10px] text-slate-400">
            Tự động xác định theo nguồn nhập, không thể chỉnh sửa.
          </p>
        </Field>
      </fieldset>

      {saveError && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {saveError}
        </p>
      )}

      <button
        type="button"
        onClick={onSave}
        disabled={disabled || isSaving || name.trim().length === 0}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-100 transition disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSaving ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Save className="size-4" />
        )}
        Lưu Strategy
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
