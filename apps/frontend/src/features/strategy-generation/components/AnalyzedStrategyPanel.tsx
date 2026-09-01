import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  renderRuleCondition,
  type RuleApplicability,
  type RuleCondition,
  type RuleIndicatorDeclaration,
  type RuleStrategyParams,
} from '@crypto-strategy-lab/shared/strategy';

interface AnalyzedStrategyPanelProps {
  params: RuleStrategyParams;
  unsupportedRequests: string[];
}

export function AnalyzedStrategyPanel({
  params,
  unsupportedRequests,
}: AnalyzedStrategyPanelProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">Analyzed strategy</h3>

      {unsupportedRequests.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-3.5 shrink-0" />
            Not supported: {unsupportedRequests.join(', ')}
          </p>
          <p className="mt-1 text-amber-700">
            Replaced with the closest supported indicator (RSI, SMA, Bollinger
            Bands).
          </p>
        </div>
      )}

      <ConditionGroup
        title="LONG conditions"
        tone="positive"
        conditions={params.conditions.long}
      />
      <ConditionGroup
        title="SHORT conditions"
        tone="negative"
        conditions={params.conditions.short}
      />

      {params.riskManagement && (
        <Section title="Risk management">
          <ul className="space-y-1">
            {params.riskManagement.stopLoss && (
              <li>Stop Loss: {params.riskManagement.stopLoss.value}%</li>
            )}
            {params.riskManagement.takeProfit && (
              <li>Take Profit: {params.riskManagement.takeProfit.value}%</li>
            )}
          </ul>
        </Section>
      )}

      <Section title="Timeframe">{params.timeframe}</Section>

      <Section title="Applicable pairs">
        {describeApplicability(params.applicability)}
      </Section>

      <Section title="Indicators">
        <ul className="space-y-1">
          {params.indicators.map((indicator, index) => (
            <li key={index}>{describeIndicator(indicator)}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-700">{title}</p>
      <div className="mt-1.5 text-xs text-slate-600">{children}</div>
    </div>
  );
}

function ConditionGroup({
  title,
  tone,
  conditions,
}: {
  title: string;
  tone: 'positive' | 'negative';
  conditions: readonly RuleCondition[];
}) {
  const dotClass = tone === 'positive' ? 'bg-emerald-500' : 'bg-rose-500';
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        <span className={`size-2 rounded-full ${dotClass}`} />
        {title}
      </p>
      {conditions.length === 0 ? (
        <p className="mt-1.5 text-xs text-slate-400">No conditions</p>
      ) : (
        <ul className="mt-1.5 space-y-1 text-xs text-slate-600">
          {conditions.map((condition, index) => (
            <li key={index}>{renderRuleCondition(condition)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function describeIndicator(indicator: RuleIndicatorDeclaration): string {
  const label = indicator.as
    ? `${indicator.name} as ${indicator.as}`
    : indicator.name;
  const params: string[] = [];
  if ('period' in indicator && indicator.period !== undefined) {
    params.push(`period=${indicator.period}`);
  }
  if ('stdDev' in indicator && indicator.stdDev !== undefined) {
    params.push(`stdDev=${indicator.stdDev}`);
  }
  return params.length > 0 ? `${label} (${params.join(', ')})` : label;
}

function describeApplicability(
  applicability: RuleApplicability | undefined,
): string {
  const pairs = applicability?.pairs;
  if (pairs === undefined || pairs === 'USDT_ALL') {
    return 'All USDT pairs (customizable)';
  }
  return pairs.join(', ');
}
