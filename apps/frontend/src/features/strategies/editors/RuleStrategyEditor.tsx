'use client';

import type {
  RuleCondition,
  RuleIndicatorDeclaration,
  RuleIndicatorName,
  RuleStrategyParams,
} from '@crypto-strategy-lab/shared/strategy';
import { Plus, X } from 'lucide-react';

import type { StrategyEditorProps } from './StrategyEditorRegistry';
import {
  RULE_INDICATOR_NAMES,
  RULE_OPERATORS,
  RULE_TIMEFRAMES,
  addCondition,
  addIndicator,
  availableReferences,
  coerceRuleParams,
  indicatorBase,
  indicatorReferences,
  percentAmount,
  removeCondition,
  removeIndicator,
  setApplicabilityMode,
  setRiskManagement,
  setTimeframe,
  updateCondition,
  updateIndicatorField,
  type ConditionFieldUpdate,
  type IndicatorFieldUpdate,
} from './ruleEditorModel';

const SECTION_LABEL =
  'mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400';
const INPUT_CLASS =
  'w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';

export function RuleStrategyEditor({ params, onChange }: StrategyEditorProps) {
  const ruleParams = coerceRuleParams(params);
  const commit = (next: RuleStrategyParams) =>
    onChange(next as unknown as Record<string, unknown>);
  const references = availableReferences(ruleParams.indicators);

  return (
    <div className="space-y-5">
      <div>
        <label className={SECTION_LABEL} htmlFor="rule-timeframe">
          Timeframe
        </label>
        <select
          className={INPUT_CLASS}
          id="rule-timeframe"
          onChange={(event) =>
            commit(
              setTimeframe(
                ruleParams,
                event.target.value as RuleStrategyParams['timeframe'],
              ),
            )
          }
          value={ruleParams.timeframe}
        >
          {RULE_TIMEFRAMES.map((timeframe) => (
            <option key={timeframe} value={timeframe}>
              {timeframe}
            </option>
          ))}
        </select>
      </div>

      <IndicatorsSection
        indicators={ruleParams.indicators}
        onAdd={(name) => commit(addIndicator(ruleParams, name))}
        onChange={(index, update) =>
          commit(updateIndicatorField(ruleParams, index, update))
        }
        onRemove={(index) => commit(removeIndicator(ruleParams, index))}
      />

      <ConditionsSection
        conditions={ruleParams.conditions.long}
        direction="long"
        label="Long conditions"
        onAdd={() =>
          commit(addCondition(ruleParams, 'long', references[0] ?? 'Close'))
        }
        onChange={(index, update) =>
          commit(updateCondition(ruleParams, 'long', index, update))
        }
        onRemove={(index) => commit(removeCondition(ruleParams, 'long', index))}
        references={references}
      />
      <ConditionsSection
        conditions={ruleParams.conditions.short}
        direction="short"
        label="Short conditions"
        onAdd={() =>
          commit(addCondition(ruleParams, 'short', references[0] ?? 'Close'))
        }
        onChange={(index, update) =>
          commit(updateCondition(ruleParams, 'short', index, update))
        }
        onRemove={(index) =>
          commit(removeCondition(ruleParams, 'short', index))
        }
        references={references}
      />

      <RiskManagementSection
        onChange={(riskManagement) =>
          commit(setRiskManagement(ruleParams, riskManagement))
        }
        riskManagement={ruleParams.riskManagement}
      />

      <ApplicabilitySection
        applicability={ruleParams.applicability}
        onChange={(mode, pairs) =>
          commit(setApplicabilityMode(ruleParams, mode, pairs))
        }
      />
    </div>
  );
}

function IndicatorsSection({
  indicators,
  onAdd,
  onChange,
  onRemove,
}: {
  indicators: readonly RuleIndicatorDeclaration[];
  onAdd: (name: RuleIndicatorName) => void;
  onChange: (index: number, update: IndicatorFieldUpdate) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className={SECTION_LABEL}>Indicators</span>
        <select
          aria-label="Add indicator"
          className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700"
          onChange={(event) => {
            const name = event.target.value as RuleIndicatorName;
            if (name.length > 0) onAdd(name);
            event.target.value = '';
          }}
          value=""
        >
          <option value="">+ Add indicator…</option>
          {RULE_INDICATOR_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {indicators.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
          No indicators declared yet.
        </p>
      ) : (
        <div className="space-y-2">
          {indicators.map((declaration, index) => (
            <div
              className="grid grid-cols-[minmax(0,1fr)_repeat(auto-fit,minmax(70px,1fr))_auto] items-end gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5"
              key={index}
            >
              <div>
                <label
                  className="mb-1 block text-[10px] font-medium text-slate-500"
                  htmlFor={`indicator-${index}-name`}
                >
                  {declaration.name}
                </label>
                <input
                  aria-label={`Alias for indicator ${index + 1}`}
                  className={INPUT_CLASS}
                  id={`indicator-${index}-name`}
                  onChange={(event) =>
                    onChange(index, {
                      as:
                        event.target.value.trim().length === 0
                          ? undefined
                          : event.target.value.trim(),
                    })
                  }
                  placeholder={indicatorBase(declaration)}
                  type="text"
                  value={declaration.as ?? ''}
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-[10px] font-medium text-slate-500"
                  htmlFor={`indicator-${index}-period`}
                >
                  Period
                </label>
                <input
                  aria-label={`Period for indicator ${index + 1}`}
                  className={INPUT_CLASS}
                  id={`indicator-${index}-period`}
                  min={2}
                  onChange={(event) =>
                    onChange(index, { period: Number(event.target.value) })
                  }
                  type="number"
                  value={declaration.period ?? ''}
                />
              </div>
              {declaration.name === 'BollingerBands' && (
                <div>
                  <label
                    className="mb-1 block text-[10px] font-medium text-slate-500"
                    htmlFor={`indicator-${index}-stddev`}
                  >
                    Std dev
                  </label>
                  <input
                    aria-label={`Standard deviation for indicator ${index + 1}`}
                    className={INPUT_CLASS}
                    id={`indicator-${index}-stddev`}
                    min={0}
                    onChange={(event) =>
                      onChange(index, { stdDev: Number(event.target.value) })
                    }
                    step={0.1}
                    type="number"
                    value={declaration.stdDev ?? ''}
                  />
                </div>
              )}
              <div className="flex flex-col items-end gap-1">
                <span className="text-[10px] text-slate-400">
                  {indicatorReferences(declaration).join(', ')}
                </span>
                <button
                  aria-label={`Remove indicator ${index + 1}`}
                  className="text-xs font-semibold text-slate-400 transition hover:text-rose-600"
                  onClick={() => onRemove(index)}
                  type="button"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConditionsSection({
  conditions,
  direction,
  label,
  onAdd,
  onChange,
  onRemove,
  references,
}: {
  conditions: readonly RuleCondition[];
  direction: 'long' | 'short';
  label: string;
  onAdd: () => void;
  onChange: (index: number, update: ConditionFieldUpdate) => void;
  onRemove: (index: number) => void;
  references: readonly string[];
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className={SECTION_LABEL}>{label}</span>
        <button
          aria-label={`Add ${direction} condition`}
          className="flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={references.length === 0}
          onClick={onAdd}
          type="button"
        >
          <Plus aria-hidden="true" className="size-3.5" /> Add condition
        </button>
      </div>

      {conditions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
          No {direction} conditions yet.
        </p>
      ) : (
        <div className="space-y-2">
          {conditions.map((condition, index) => (
            <div
              className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5"
              key={index}
            >
              <select
                aria-label={`${direction} condition ${index + 1} left operand`}
                className={INPUT_CLASS}
                onChange={(event) =>
                  onChange(index, { indicator: event.target.value })
                }
                value={condition.indicator}
              >
                {references.map((reference) => (
                  <option key={reference} value={reference}>
                    {reference}
                  </option>
                ))}
              </select>
              <select
                aria-label={`${direction} condition ${index + 1} operator`}
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-400"
                onChange={(event) =>
                  onChange(index, {
                    operator: event.target.value as RuleCondition['operator'],
                  })
                }
                value={condition.operator}
              >
                {RULE_OPERATORS.map((operator) => (
                  <option key={operator} value={operator}>
                    {operator}
                  </option>
                ))}
              </select>
              <ConditionRightOperand
                condition={condition}
                index={index}
                onChange={onChange}
                references={references}
              />
              <button
                aria-label={`Remove ${direction} condition ${index + 1}`}
                className="text-xs font-semibold text-slate-400 transition hover:text-rose-600"
                onClick={() => onRemove(index)}
                type="button"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConditionRightOperand({
  condition,
  index,
  onChange,
  references,
}: {
  condition: RuleCondition;
  index: number;
  onChange: (index: number, update: ConditionFieldUpdate) => void;
  references: readonly string[];
}) {
  const usesIndicatorRef = condition.indicatorRef !== undefined;
  return (
    <div className="flex items-center gap-1.5">
      <select
        aria-label={`Right operand kind for condition ${index + 1}`}
        className="rounded-md border border-slate-200 bg-white px-1.5 py-1.5 text-[11px] text-slate-500 outline-none"
        onChange={(event) => {
          if (event.target.value === 'value') {
            onChange(index, { indicatorRef: undefined, value: 0 });
          } else {
            onChange(index, {
              indicatorRef: references[0],
              value: undefined,
            });
          }
        }}
        value={usesIndicatorRef ? 'ref' : 'value'}
      >
        <option value="value">value</option>
        <option value="ref">indicator</option>
      </select>
      {usesIndicatorRef ? (
        <select
          aria-label={`Right operand indicator for condition ${index + 1}`}
          className={INPUT_CLASS}
          onChange={(event) =>
            onChange(index, { indicatorRef: event.target.value })
          }
          value={condition.indicatorRef}
        >
          {references.map((reference) => (
            <option key={reference} value={reference}>
              {reference}
            </option>
          ))}
        </select>
      ) : (
        <input
          aria-label={`Right operand value for condition ${index + 1}`}
          className={INPUT_CLASS}
          onChange={(event) =>
            onChange(index, { value: Number(event.target.value) })
          }
          type="number"
          value={condition.value ?? 0}
        />
      )}
    </div>
  );
}

function RiskManagementSection({
  onChange,
  riskManagement,
}: {
  onChange: (riskManagement: RuleStrategyParams['riskManagement']) => void;
  riskManagement: RuleStrategyParams['riskManagement'];
}) {
  const stopLoss = riskManagement?.stopLoss?.value;
  const takeProfit = riskManagement?.takeProfit?.value;

  const update = (next: {
    stopLoss?: number | undefined;
    takeProfit?: number | undefined;
  }) => {
    const stopLossValue = 'stopLoss' in next ? next.stopLoss : stopLoss;
    const takeProfitValue = 'takeProfit' in next ? next.takeProfit : takeProfit;
    if (stopLossValue === undefined && takeProfitValue === undefined) {
      onChange(undefined);
      return;
    }
    onChange({
      ...(stopLossValue === undefined
        ? {}
        : { stopLoss: percentAmount(stopLossValue) }),
      ...(takeProfitValue === undefined
        ? {}
        : { takeProfit: percentAmount(takeProfitValue) }),
    });
  };

  return (
    <div>
      <span className={SECTION_LABEL}>Risk management</span>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            className="mb-1 block text-[10px] font-medium text-slate-500"
            htmlFor="rule-stop-loss"
          >
            Stop loss %
          </label>
          <input
            aria-label="Stop loss percent"
            className={INPUT_CLASS}
            id="rule-stop-loss"
            max={100}
            min={0}
            onChange={(event) =>
              update({
                stopLoss:
                  event.target.value.trim().length === 0
                    ? undefined
                    : Number(event.target.value),
              })
            }
            placeholder="Off"
            type="number"
            value={stopLoss ?? ''}
          />
        </div>
        <div>
          <label
            className="mb-1 block text-[10px] font-medium text-slate-500"
            htmlFor="rule-take-profit"
          >
            Take profit %
          </label>
          <input
            aria-label="Take profit percent"
            className={INPUT_CLASS}
            id="rule-take-profit"
            max={100}
            min={0}
            onChange={(event) =>
              update({
                takeProfit:
                  event.target.value.trim().length === 0
                    ? undefined
                    : Number(event.target.value),
              })
            }
            placeholder="Off"
            type="number"
            value={takeProfit ?? ''}
          />
        </div>
      </div>
    </div>
  );
}

function ApplicabilitySection({
  applicability,
  onChange,
}: {
  applicability: RuleStrategyParams['applicability'];
  onChange: (
    mode: 'any' | 'usdtAll' | 'custom',
    customPairs: readonly string[],
  ) => void;
}) {
  const pairs = applicability?.pairs;
  const mode =
    pairs === undefined ? 'any' : pairs === 'USDT_ALL' ? 'usdtAll' : 'custom';
  const customText = Array.isArray(pairs) ? pairs.join(', ') : '';

  return (
    <div>
      <span className={SECTION_LABEL}>Applicable pairs</span>
      <select
        aria-label="Applicable pairs mode"
        className={INPUT_CLASS}
        onChange={(event) =>
          onChange(event.target.value as 'any' | 'usdtAll' | 'custom', [])
        }
        value={mode}
      >
        <option value="any">Any pair</option>
        <option value="usdtAll">All USDT pairs</option>
        <option value="custom">Specific pairs</option>
      </select>
      {mode === 'custom' && (
        <input
          aria-label="Comma-separated pairs"
          className={`${INPUT_CLASS} mt-2`}
          onChange={(event) =>
            onChange(
              'custom',
              event.target.value
                .split(',')
                .map((pair) => pair.trim().toUpperCase())
                .filter((pair) => pair.length > 0),
            )
          }
          placeholder="BTCUSDT, ETHUSDT"
          type="text"
          value={customText}
        />
      )}
    </div>
  );
}
