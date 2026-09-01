'use client';

import type { StrategyParamsSchema } from '@crypto-strategy-lab/shared';
import { useEffect, useRef, useState } from 'react';

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

  if (params !== syncedParams) {
    setSyncedParams(params);
    setText(toTextValues(params, paramsSchema));
  }

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const initializedFor = useRef<string | null>(null);

  useEffect(() => {
    // Notify the parent with resolved defaults once per mounted editor instance, so a
    // freshly-added member/entry has real params instead of {} before the user touches a
    // field. Reading from a ref keeps this from re-firing on every parent re-render.
    if (initializedFor.current === idPrefix) return;
    initializedFor.current = idPrefix;
    if (Object.keys(params).length > 0) return;
    const resolved = resolveParameters(
      createDefaultParameterValues(paramsSchema),
      paramsSchema,
    );
    if (resolved !== null) onChangeRef.current(resolved);
    // idPrefix identifies the editor instance; params/paramsSchema are read once via the
    // closure above and don't need to retrigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idPrefix]);

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
