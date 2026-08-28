export const FINANCIAL_CHART_COLORS = {
  down: '#f43f5e',
  forming: '#fbbf24',
  up: '#10b981',
  wickDown: '#fb7185',
  wickUp: '#34d399',
} as const;

export interface FinancialChartCandle {
  /** UTC epoch seconds; renderers may convert this to their native time type. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  isClosed?: boolean;
}

export interface FinancialChartPoint {
  time: number;
  value: number;
}

export interface FinancialChartVolumeBar {
  time: number;
  value: number;
  color?: string;
}

export interface FinancialChartLine {
  id: string;
  color: string;
  /** Zero is the price pane; higher values create independent indicator panes. */
  pane?: number;
  points: readonly FinancialChartPoint[];
}

export type FinancialChartMarkerPosition = 'aboveBar' | 'belowBar';

export type FinancialChartMarkerShape = 'arrowDown' | 'arrowUp' | 'circle';

export interface FinancialChartMarker {
  time: number;
  position: FinancialChartMarkerPosition;
  shape: FinancialChartMarkerShape;
  color: string;
  text?: string;
}

export interface FinancialChartData {
  candles: readonly FinancialChartCandle[];
  volume: readonly FinancialChartVolumeBar[];
  lines: readonly FinancialChartLine[];
  markers: readonly FinancialChartMarker[];
}

export interface FinancialChartRendererOptions {
  height: number;
  /** Called when the user reaches the renderer's oldest currently loaded data. */
  onReachedHistoryBoundary?: () => void;
}

export interface FinancialChartInstance {
  setData(data: FinancialChartData): void;
  resize(): void;
  destroy(): void;
}

/**
 * Browser charting seam. Implementations render plain financial data only;
 * they do not own market-data subscriptions, strategy execution, or network
 * access.
 */
export interface FinancialChartRenderer {
  mount(
    container: HTMLElement,
    options: FinancialChartRendererOptions,
  ): FinancialChartInstance;
}
