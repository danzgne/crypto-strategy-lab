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

// Checks the CSS subset the generation prompt allows, then actually runs the
// selector, so one that's syntactically in-subset but still throws is rejected too.
export function isSupportedSelector(selector: string): boolean {
  if (!matchesSupportedSubset(selector)) return false;

  try {
    parse('<div></div>').querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

// Returns the dotted path of each unsupported selector ("item", "fields.title", ...).
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
