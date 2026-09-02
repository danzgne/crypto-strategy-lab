import type { StrategyParamsSchema } from '@crypto-strategy-lab/shared';
import type { ComponentType } from 'react';

export interface StrategyEditorProps {
  paramsSchema: StrategyParamsSchema;
  params: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
  idPrefix: string;
}

export type StrategyEditorComponent = ComponentType<StrategyEditorProps>;

const editors = new Map<string, StrategyEditorComponent>();

export const StrategyEditorRegistry = {
  register(strategyId: string, component: StrategyEditorComponent): void {
    editors.set(strategyId, component);
  },
  resolve(
    strategyId: string,
    fallback: StrategyEditorComponent,
  ): StrategyEditorComponent {
    return editors.get(strategyId) ?? fallback;
  },
};
