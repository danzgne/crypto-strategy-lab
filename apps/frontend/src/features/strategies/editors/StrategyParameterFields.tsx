'use client';

import type { StrategyParamDefinition } from '@crypto-strategy-lab/shared';

export interface StrategyParameterFieldsProperties {
  definitions: Readonly<Record<string, StrategyParamDefinition>>;
  idPrefix: string;
  labelPrefix: string;
  values: Readonly<Record<string, string>>;
  onChange: (name: string, value: string) => void;
}

export function StrategyParameterFields({
  definitions,
  idPrefix,
  labelPrefix,
  onChange,
  values,
}: StrategyParameterFieldsProperties) {
  return Object.entries(definitions).map(([name, parameter]) => {
    const isInteger = parameter.type === 'integer';
    const label = `${labelPrefix} ${name}`;
    return (
      <div key={name}>
        <label
          className="mb-1 block text-[11px] font-medium text-slate-500"
          htmlFor={`${idPrefix}-${name}`}
        >
          {label}
        </label>
        <input
          aria-label={label}
          className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          id={`${idPrefix}-${name}`}
          max={parameter.maximum}
          min={parameter.minimum}
          onChange={(event) => onChange(name, event.target.value)}
          step={isInteger ? 1 : 0.01}
          type={isInteger || parameter.type === 'number' ? 'number' : 'text'}
          value={values[name] ?? ''}
        />
        {parameter.description !== undefined && (
          <p className="mt-1 text-[10px] leading-4 text-slate-400">
            {parameter.description}
          </p>
        )}
      </div>
    );
  });
}
