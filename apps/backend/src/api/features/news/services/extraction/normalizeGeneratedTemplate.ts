import {
  TEMPLATE_FIELD_NAMES,
  type ExtractionTemplate,
} from '@crypto-strategy-lab/shared';
import type { ExtractionTemplateWireResponse } from './wireSchema';

export function normalizeGeneratedTemplate(
  wire: ExtractionTemplateWireResponse,
): ExtractionTemplate {
  const fields = {} as ExtractionTemplate['fields'];
  for (const field of TEMPLATE_FIELD_NAMES) {
    const locator = wire.fields[field];
    fields[field] = {
      selector: locator.selector,
      ...(locator.attr !== null ? { attr: locator.attr } : {}),
    };
  }

  return {
    item: wire.item,
    fields,
    confidence: wire.confidence,
    ...(wire.notes !== null ? { notes: wire.notes } : {}),
  };
}
