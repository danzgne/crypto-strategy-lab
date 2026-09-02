import { parse } from 'node-html-parser';
import {
  TEMPLATE_FIELD_NAMES,
  type ExtractionTemplate,
} from '@crypto-strategy-lab/shared';

const SIMPLE_SELECTOR_TOKEN =
  /^(?:[a-zA-Z][a-zA-Z0-9-]*)?(?:\.[a-zA-Z_-][\w-]*|#[a-zA-Z_-][\w-]*|\[[a-zA-Z_:][\w:-]*(?:=(?:"[^"]*"|'[^']*'))?\])*$/;

function matchesSupportedSubset(selector: string): boolean {
  const trimmed = selector.trim();
  if (trimmed.length === 0) return false;

  const tokens = trimmed.split(/\s+/);
  return tokens.every(
    (token) => token.length > 0 && SIMPLE_SELECTOR_TOKEN.test(token),
  );
}

/**
 * The generation and proposal prompts constrain the model to a CSS subset that
 * node-html-parser's selector engine fully covers: tag, class, id, attribute, and
 * the descendant combinator. This checks a candidate selector against that subset
 * and then actually runs it, so a selector that is syntactically in-subset but
 * still throws at query time (e.g. malformed brackets) is still rejected.
 */
export function isSupportedSelector(selector: string): boolean {
  if (!matchesSupportedSubset(selector)) return false;

  try {
    parse('<div></div>').querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates every selector in a candidate template. Returns the empty array when
 * the template is fully usable, otherwise the dotted path of each bad selector
 * ("item", "fields.title", ...) so the caller can log or surface what failed.
 */
export function validateTemplateSelectors(
  template: ExtractionTemplate,
): string[] {
  const issues: string[] = [];

  if (!isSupportedSelector(template.item)) {
    issues.push('item');
  }

  for (const field of TEMPLATE_FIELD_NAMES) {
    const locator = template.fields[field];
    if (!locator || !isSupportedSelector(locator.selector)) {
      issues.push(`fields.${field}`);
    }
  }

  return issues;
}
