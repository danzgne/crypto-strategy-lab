import { describe, expect, it, vi } from 'vitest';

import {
  toVendorJsonSchema,
  type VendorSchemaRules,
} from '../../../src/llm/jsonSchemaSanitizer';
import { createAppLogger } from '../../../src/utils/logger';

function silentLogger() {
  return createAppLogger({ service: 'test', enabled: false });
}

const GEMINI_RULES: VendorSchemaRules = {
  vendor: 'gemini',
  stripKeywords: ['pattern', 'minLength', 'maxLength', 'default'],
  allowedFormats: ['date-time', 'date', 'time'],
  collapseNullableAnyOf: true,
};

const GROQ_RULES: VendorSchemaRules = {
  vendor: 'groq',
  stripKeywords: ['pattern', 'minLength', 'maxLength', 'default'],
  allowedFormats: [],
  collapseNullableAnyOf: false,
};

describe('toVendorJsonSchema', () => {
  it('deletes the top-level $schema Zod always emits', () => {
    const result = toVendorJsonSchema(
      {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
      },
      GEMINI_RULES,
      silentLogger(),
    );

    expect(result).toEqual({ type: 'object' });
  });

  it('rewrites const to enum', () => {
    const result = toVendorJsonSchema(
      { type: 'string', const: 'BUY' },
      GEMINI_RULES,
      silentLogger(),
    );

    expect(result).toEqual({ type: 'string', enum: ['BUY'] });
  });

  it('rewrites oneOf to anyOf and drops allOf, logging a warning for each', () => {
    const logger = silentLogger();
    const warn = vi.spyOn(logger, 'warn');

    const result = toVendorJsonSchema(
      {
        oneOf: [{ type: 'string' }, { type: 'number' }],
        allOf: [{ type: 'object' }],
      },
      GEMINI_RULES,
      logger,
    );

    expect(result).toEqual({ anyOf: [{ type: 'string' }, { type: 'number' }] });
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: 'oneOf (rewritten to anyOf)' }),
      expect.any(String),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: 'allOf' }),
      expect.any(String),
    );
  });

  it('strips vendor-unsupported keywords recursively and logs a warning', () => {
    const logger = silentLogger();
    const warn = vi.spyOn(logger, 'warn');

    const result = toVendorJsonSchema(
      {
        type: 'object',
        properties: {
          code: { type: 'string', pattern: '^[A-Z]+$', minLength: 1 },
        },
      },
      GEMINI_RULES,
      logger,
    );

    expect(result).toEqual({
      type: 'object',
      properties: { code: { type: 'string' } },
      required: ['code'],
    });
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: 'pattern' }),
      expect.any(String),
    );
  });

  it('drops a format value the vendor does not document', () => {
    const geminiResult = toVendorJsonSchema(
      { type: 'string', format: 'uuid' },
      GEMINI_RULES,
      silentLogger(),
    );
    expect(geminiResult).toEqual({ type: 'string' });

    const geminiDateTime = toVendorJsonSchema(
      { type: 'string', format: 'date-time' },
      GEMINI_RULES,
      silentLogger(),
    );
    expect(geminiDateTime).toEqual({ type: 'string', format: 'date-time' });
  });

  it('strips format unconditionally for a vendor documenting no format values', () => {
    const result = toVendorJsonSchema(
      { type: 'string', format: 'date-time' },
      GROQ_RULES,
      silentLogger(),
    );

    expect(result).toEqual({ type: 'string' });
  });

  it('fills required with every property key, recursively', () => {
    const result = toVendorJsonSchema(
      {
        type: 'object',
        properties: {
          a: { type: 'string' },
          nested: {
            type: 'object',
            properties: { b: { type: 'number' } },
          },
        },
        required: ['a'],
      },
      GEMINI_RULES,
      silentLogger(),
    );

    expect(result).toEqual({
      type: 'object',
      properties: {
        a: { type: 'string' },
        nested: {
          type: 'object',
          properties: { b: { type: 'number' } },
          required: ['b'],
        },
      },
      required: ['a', 'nested'],
    });
  });

  it('collapses a nullable bare-type anyOf into a type array for Gemini only', () => {
    const nullableAnyOf = {
      anyOf: [{ type: 'string' }, { type: 'null' }],
    };

    expect(
      toVendorJsonSchema(nullableAnyOf, GEMINI_RULES, silentLogger()),
    ).toEqual({ type: ['string', 'null'] });

    expect(
      toVendorJsonSchema(nullableAnyOf, GROQ_RULES, silentLogger()),
    ).toEqual(nullableAnyOf);
  });

  it('leaves a nullable anyOf branch alone when it carries its own keywords', () => {
    const nullableAnyOf = {
      anyOf: [{ type: 'string', enum: ['a', 'b'] }, { type: 'null' }],
    };

    expect(
      toVendorJsonSchema(nullableAnyOf, GEMINI_RULES, silentLogger()),
    ).toEqual(nullableAnyOf);
  });

  it('does not mutate the schema passed in', () => {
    const input = { type: 'string', const: 'BUY' };
    toVendorJsonSchema(input, GEMINI_RULES, silentLogger());

    expect(input).toEqual({ type: 'string', const: 'BUY' });
  });
});
