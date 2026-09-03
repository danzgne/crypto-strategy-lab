import type { ExtractionTemplate } from '@crypto-strategy-lab/shared';
import type { FieldBreakdown } from './templateApplier';

export const EXTRACTION_TEMPLATE_CONSUMER_ID = 'extraction';

const SELECTOR_RULES = `Selectors are evaluated with a small CSS engine: tag names, ".class", "#id", and "[attr]"/"[attr=\\"value\\"]" attribute selectors, combined with the descendant combinator (a space) only. Do not use child (">"), sibling ("+", "~") combinators, pseudo-classes/elements (":nth-child", "::before"), or attribute operators other than "=". Every field selector is evaluated relative to its item container, not the whole document.`;

const OUTPUT_RULES = `Return exactly this shape: {"item": "<container selector>", "fields": {"title": {"selector": ..., "attr": string|null}, "summary": {...}, "publishedAt": {...}, "url": {...}}, "confidence": 0..1, "notes": string|null}. Set "attr" to null to read the element's text content; set it to an attribute name (for example "datetime" or "href") to read that attribute instead. For "publishedAt" specifically, prefer a machine-readable attribute such as "datetime", "content", or a "data-*" attribute over visible relative-time text like "3 mins ago", because the applier can parse ISO-8601/RFC-2822 reliably but free text only through a narrow relative-time reader. For "url", leave "attr" null to default to the link's "href". "confidence" is your own self-assessed 0..1 confidence in this template, not a restatement of any error rate you were given.`;

export function buildGenerationPrompt(
  sourceUrl: string,
  trimmedHtml: string,
): string {
  return [
    `You write an Extraction Template that locates a news listing on one page, so a program can find every article card and pull four fields from each: title, summary, publishedAt, url.`,
    `The template describes an item CONTAINER selector (one that matches every article card on the page) plus one field selector per field, each evaluated relative to that container.`,
    SELECTOR_RULES,
    OUTPUT_RULES,
    `Source URL: ${sourceUrl}`,
    `Stripped, whitespace-collapsed HTML of the page:\n"""\n${trimmedHtml}\n"""`,
  ].join('\n\n');
}

export function buildProposalPrompt(
  sourceUrl: string,
  trimmedHtml: string,
  activeTemplate: ExtractionTemplate,
  fieldBreakdown: FieldBreakdown,
): string {
  const breakdownLines = (
    Object.keys(fieldBreakdown) as (keyof FieldBreakdown)[]
  ).map(
    (field) =>
      `- ${field} (selector "${activeTemplate.fields[field].selector}"${
        activeTemplate.fields[field].attr
          ? ` attr "${activeTemplate.fields[field].attr}"`
          : ''
      }): ${(fieldBreakdown[field].emptyRate * 100).toFixed(1)}% empty, ${(
        fieldBreakdown[field].malformedRate * 100
      ).toFixed(1)}% malformed`,
  );

  return [
    `The Extraction Template currently active for this news listing has drifted: it is producing too many empty or malformed fields. Propose a replacement template that fixes the fields below while keeping the ones that are working.`,
    `Active item container selector: "${activeTemplate.item}"`,
    `Per-field validation over recent crawls of this page:\n${breakdownLines.join('\n')}`,
    SELECTOR_RULES,
    OUTPUT_RULES,
    `Source URL: ${sourceUrl}`,
    `Freshly fetched, stripped, whitespace-collapsed HTML of the page:\n"""\n${trimmedHtml}\n"""`,
  ].join('\n\n');
}
