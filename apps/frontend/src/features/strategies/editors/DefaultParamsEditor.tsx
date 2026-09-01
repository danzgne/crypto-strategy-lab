'use client';

import type { StrategyParamsSchema } from '@crypto-strategy-lab/shared';
import { useState } from 'react';

import type { StrategyEditorProps } from './StrategyEditorRegistry';
import { StrategyParameterFields } from './StrategyParameterFields';
import { createDefaultParameterValues, resolveParameters } from './paramsForm';

export interface DefaultParamsEditorProps extends StrategyEditorProps {
  labelPrefix?: string;
}

export function DefaultParamsEditor({
  paramsSchema,
  params,
  onChange,
  idPrefix,
  labelPrefix = '',
}: DefaultParamsEditorProps) {
  const [text, setText] = useState<Record<string, string>>(() =>
    toTextValues(params, paramsSchema),
  );
  const [syncedParams, setSyncedParams] = useState(params);
  const [initializedFor, setInitializedFor] = useState<string | null>(null);

  if (params !== syncedParams) {
    setSyncedParams(params);
    setText(toTextValues(params, paramsSchema));
  }

  if (initializedFor !== idPrefix) {
    setInitializedFor(idPrefix);
    // Push resolved defaults up once per mounted editor instance, so a freshly-added
    // member/entry has real params instead of {} before the user touches a field.
    if (Object.keys(params).length === 0) {
      const resolved = resolveParameters(
        createDefaultParameterValues(paramsSchema),
        paramsSchema,
      );
      if (resolved !== null) onChange(resolved);
    }
  }

  if (Object.keys(paramsSchema.properties).length === 0) {
    return (
      <p className="text-xs text-slate-400">
        This strategy has no configurable parameters.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <StrategyParameterFields
        definitions={paramsSchema.properties}
        idPrefix={idPrefix}
        labelPrefix={labelPrefix}
        onChange={(name, value) => {
          const nextText = { ...text, [name]: value };
          setText(nextText);
          const resolved = resolveParameters(nextText, paramsSchema);
          if (resolved !== null) onChange(resolved);
        }}
        values={text}
      />
    </div>
  );
}

function toTextValues(
  params: Record<string, unknown>,
  paramsSchema: StrategyParamsSchema,
): Record<string, string> {
  const defaults = createDefaultParameterValues(paramsSchema);
  const overrides = Object.fromEntries(
    Object.entries(params)
      .filter(([name]) => name in paramsSchema.properties)
      .map(([name, value]) => [name, String(value)]),
  );
  return { ...defaults, ...overrides };
}
