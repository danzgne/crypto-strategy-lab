import { parse } from 'node-html-parser';
import {
  TEMPLATE_FIELD_NAMES,
  type ExtractionTemplate,
  type RawNewsItem,
  type TemplateApplicationMetrics,
  type TemplateFieldName,
} from '@crypto-strategy-lab/shared';
import { parseTimestamp } from './dateParsing';
import { resolveItemUrl } from './urlResolution';

export interface FieldBreakdownEntry {
  emptyRate: number;
  malformedRate: number;
}

export type FieldBreakdown = Record<TemplateFieldName, FieldBreakdownEntry>;

export interface TemplateApplicationResult {
  items: RawNewsItem[];
  metrics: TemplateApplicationMetrics;
  /** Per-field empty/malformed rates, used only to brief a replacement proposal. */
  fieldBreakdown: FieldBreakdown;
}

function emptyFieldBreakdown(): FieldBreakdown {
  return {
    title: { emptyRate: 0, malformedRate: 0 },
    summary: { emptyRate: 0, malformedRate: 0 },
    publishedAt: { emptyRate: 0, malformedRate: 0 },
    url: { emptyRate: 0, malformedRate: 0 },
  };
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function readField(
  container: ReturnType<typeof parse>,
  field: TemplateFieldName,
  locator: ExtractionTemplate['fields'][TemplateFieldName],
): string {
  let node;
  try {
    node = container.querySelector(locator.selector);
  } catch {
    node = null;
  }
  if (node === null) return '';

  const attr = locator.attr ?? (field === 'url' ? 'href' : undefined);
  const raw = attr !== undefined ? (node.getAttribute(attr) ?? '') : node.text;
  return collapseWhitespace(raw);
}

/**
 * Pure selector evaluation: no network call and no model. A template is only ever
 * written by an LLM at generation or proposal time (see extractionTemplateService);
 * applying one against fetched HTML is nothing more than this function.
 */
export function applyTemplate(
  html: string,
  template: ExtractionTemplate,
  sourceUrl: string,
  sourceName: string,
  now: Date,
): TemplateApplicationResult {
  const root = parse(html);
  const containers = root.querySelectorAll(template.item);
  const fieldSlots =
    Math.max(containers.length, 1) * TEMPLATE_FIELD_NAMES.length;

  if (containers.length === 0) {
    const breakdown = emptyFieldBreakdown();
    for (const field of TEMPLATE_FIELD_NAMES) {
      breakdown[field].emptyRate = 1;
    }
    return {
      items: [],
      metrics: { itemCount: 0, emptyFieldRate: 1, malformedFieldRate: 0 },
      fieldBreakdown: breakdown,
    };
  }

  const items: RawNewsItem[] = [];
  let emptyCount = 0;
  let malformedCount = 0;
  const emptyByField: Record<TemplateFieldName, number> = {
    title: 0,
    summary: 0,
    publishedAt: 0,
    url: 0,
  };
  const malformedByField: Record<TemplateFieldName, number> = {
    title: 0,
    summary: 0,
    publishedAt: 0,
    url: 0,
  };

  for (const container of containers) {
    const raw: Record<TemplateFieldName, string> = {
      title: '',
      summary: '',
      publishedAt: '',
      url: '',
    };
    const isEmpty: Record<TemplateFieldName, boolean> = {
      title: false,
      summary: false,
      publishedAt: false,
      url: false,
    };

    for (const field of TEMPLATE_FIELD_NAMES) {
      const value = readField(container, field, template.fields[field]);
      raw[field] = value;
      if (value.length === 0) {
        isEmpty[field] = true;
        emptyCount += 1;
        emptyByField[field] += 1;
      }
    }

    let publishedAt = now;
    if (!isEmpty.publishedAt) {
      const parsed = parseTimestamp(raw.publishedAt, now);
      publishedAt = parsed.date;
      if (parsed.malformed) {
        malformedCount += 1;
        malformedByField.publishedAt += 1;
      }
    }

    let resolvedUrl = '';
    let urlUnusable = isEmpty.url;
    if (!isEmpty.url) {
      const resolved = resolveItemUrl(raw.url, sourceUrl);
      resolvedUrl = resolved.url;
      if (resolved.malformed) {
        urlUnusable = true;
        malformedCount += 1;
        malformedByField.url += 1;
      }
    }

    if (isEmpty.title || urlUnusable) continue;

    items.push({
      title: raw.title,
      content: raw.summary.length > 0 ? raw.summary : raw.title,
      url: resolvedUrl,
      publishedAt,
      source: sourceName,
    });
  }

  const fieldBreakdown = emptyFieldBreakdown();
  for (const field of TEMPLATE_FIELD_NAMES) {
    fieldBreakdown[field] = {
      emptyRate: emptyByField[field] / containers.length,
      malformedRate: malformedByField[field] / containers.length,
    };
  }

  return {
    items,
    metrics: {
      itemCount: containers.length,
      emptyFieldRate: emptyCount / fieldSlots,
      malformedFieldRate: malformedCount / fieldSlots,
    },
    fieldBreakdown,
  };
}
