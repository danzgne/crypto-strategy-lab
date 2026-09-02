'use client';

import { X } from 'lucide-react';
import { useId, useState } from 'react';

export interface TagsInputProperties {
  value: readonly string[];
  onChange: (tags: string[]) => void;
  suggestions?: readonly string[];
}

export function TagsInput({
  onChange,
  suggestions = [],
  value,
}: TagsInputProperties) {
  const [draft, setDraft] = useState('');
  const listId = useId();

  const addTag = (raw: string): void => {
    const tag = raw.trim();
    if (tag.length === 0 || value.includes(tag)) return;
    onChange([...value, tag]);
    setDraft('');
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((tag) => (
          <span
            className="flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700"
            key={tag}
          >
            {tag}
            <button
              aria-label={`Remove tag ${tag}`}
              className="text-indigo-400 transition hover:text-indigo-700"
              onClick={() => onChange(value.filter((entry) => entry !== tag))}
              type="button"
            >
              <X aria-hidden="true" className="size-3" />
            </button>
          </span>
        ))}
        <input
          aria-label="Add tag"
          className="min-w-[6rem] flex-1 rounded-lg border border-indigo-100 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          list={listId}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              addTag(draft);
            } else if (event.key === 'Backspace' && draft.length === 0) {
              onChange(value.slice(0, -1));
            }
          }}
          placeholder="Add a tag…"
          type="text"
          value={draft}
        />
        <datalist id={listId}>
          {suggestions
            .filter((tag) => !value.includes(tag))
            .map((tag) => (
              <option key={tag} value={tag} />
            ))}
        </datalist>
      </div>
    </div>
  );
}
