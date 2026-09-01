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
      <h3 className="text-sm font-bold text-slate-900">
        Strategy đã phân tích
      </h3>

      {unsupportedRequests.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-3.5 shrink-0" />
            Không hỗ trợ: {unsupportedRequests.join(', ')}
          </p>
          <p className="mt-1 text-amber-700">
            Hệ thống đã thay thế bằng chỉ báo gần nhất được hỗ trợ (RSI, SMA,
            Bollinger Bands).
          </p>
        </div>
      )}

      <ConditionGroup
        title="Điều kiện LONG"
        tone="positive"
        conditions={params.conditions.long}
      />
      <ConditionGroup
        title="Điều kiện SHORT"
        tone="negative"
        conditions={params.conditions.short}
      />

      {params.riskManagement && (
        <Section title="Quản trị rủi ro">
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

      <Section title="Khung thời gian">{params.timeframe}</Section>

      <Section title="Áp dụng cho cặp">
        {describeApplicability(params.applicability)}
      </Section>

      <Section title="Chỉ báo">
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
        <p className="mt-1.5 text-xs text-slate-400">Không có điều kiện</p>
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
    return 'Tất cả cặp USDT (có thể tùy chỉnh)';
  }
  return pairs.join(', ');
}
