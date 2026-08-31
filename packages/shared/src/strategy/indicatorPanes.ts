const INDICATOR_REFERENCE_PANES: Readonly<Record<string, number>> = {
  RSI: 1,
};

export function paneForIndicatorReference(reference: string): number {
  return INDICATOR_REFERENCE_PANES[reference] ?? 0;
}
