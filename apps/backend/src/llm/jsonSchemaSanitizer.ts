import type { AppLogger } from '../utils/logger';

export type JsonSchemaNode = Record<string, unknown>;

export interface VendorSchemaRules {
  readonly vendor: string;
  readonly stripKeywords: readonly string[];
  readonly allowedFormats: readonly string[];
  readonly collapseNullableAnyOf: boolean;
}

export function toVendorJsonSchema(
  schema: unknown,
  rules: VendorSchemaRules,
  logger: AppLogger,
): unknown {
  const root = structuredClone(schema);
  if (isPlainObject(root)) delete root['$schema'];
  sanitizeNode(root, rules, logger);
  return root;
}

function sanitizeNode(
  node: unknown,
  rules: VendorSchemaRules,
  logger: AppLogger,
): void {
  if (Array.isArray(node)) {
    for (const item of node) sanitizeNode(item, rules, logger);
    return;
  }
  if (!isPlainObject(node)) return;

  if ('const' in node) {
    node['enum'] = [node['const']];
    delete node['const'];
  }

  if ('oneOf' in node) {
    warnDropped(logger, rules.vendor, 'oneOf (rewritten to anyOf)');
    node['anyOf'] = node['oneOf'];
    delete node['oneOf'];
  }

  if ('allOf' in node) {
    warnDropped(logger, rules.vendor, 'allOf');
    delete node['allOf'];
  }

  for (const keyword of rules.stripKeywords) {
    if (keyword in node) {
      warnDropped(logger, rules.vendor, keyword);
      delete node[keyword];
    }
  }

  const format = node['format'];
  if (typeof format === 'string' && !rules.allowedFormats.includes(format)) {
    warnDropped(logger, rules.vendor, `format:${format}`);
    delete node['format'];
  }

  if (rules.collapseNullableAnyOf && Array.isArray(node['anyOf'])) {
    const collapsed = collapseNullableAnyOf(node['anyOf']);
    if (collapsed !== null) {
      delete node['anyOf'];
      node['type'] = collapsed;
    }
  }

  const properties = node['properties'];
  if (isPlainObject(properties)) {
    node['required'] = Object.keys(properties);
    for (const value of Object.values(properties)) {
      sanitizeNode(value, rules, logger);
    }
  }

  const items = node['items'];
  if (Array.isArray(items)) {
    for (const item of items) sanitizeNode(item, rules, logger);
  } else if (items !== undefined) {
    sanitizeNode(items, rules, logger);
  }

  const prefixItems = node['prefixItems'];
  if (Array.isArray(prefixItems)) {
    for (const item of prefixItems) sanitizeNode(item, rules, logger);
  }

  const anyOf = node['anyOf'];
  if (Array.isArray(anyOf)) {
    for (const branch of anyOf) sanitizeNode(branch, rules, logger);
  }

  const additionalProperties = node['additionalProperties'];
  if (isPlainObject(additionalProperties)) {
    sanitizeNode(additionalProperties, rules, logger);
  }
}

function collapseNullableAnyOf(branches: unknown[]): unknown {
  if (branches.length !== 2) return null;
  const nullBranch = branches.find(
    (branch) =>
      isPlainObject(branch) &&
      Object.keys(branch).length === 1 &&
      branch['type'] === 'null',
  );
  const typeBranch = branches.find((branch) => branch !== nullBranch);
  if (
    nullBranch === undefined ||
    !isPlainObject(typeBranch) ||
    Object.keys(typeBranch).length !== 1 ||
    typeof typeBranch['type'] !== 'string'
  ) {
    return null;
  }
  return [typeBranch['type'], 'null'];
}

function warnDropped(logger: AppLogger, vendor: string, keyword: string): void {
  logger.warn(
    { vendor, keyword },
    'Dropped unsupported JSON Schema keyword for LLM vendor',
  );
}

function isPlainObject(value: unknown): value is JsonSchemaNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
