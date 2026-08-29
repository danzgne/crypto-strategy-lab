# LLM JSON Provider wire formats

**Researched:** 2026-08-29
**Scope:** HTTP wire format for schema-constrained JSON generation from two vendors (Gemini 3.1 Flash-Lite via
the Gemini API, DeepSeek V4 Flash via the OpenCode Zen gateway), and whether Zod 4.4.3's `z.toJSONSchema()`
output is directly usable as each vendor's schema. Non-streaming single-shot calls only. No API keys were
available, so no request was executed against either vendor's generation endpoint; the Zen findings marked
"probed" come from unauthenticated requests to its public endpoints.

## Recommendation

The two vendors are **not** symmetric, and the asymmetry is bigger than the ADRs assume.

1. **Gemini is a genuine schema-constrained provider.** `gemini-3.1-flash-lite` is a real, current, generally
   available model id. Use the Interactions API with `response_format`.
2. **DeepSeek V4 Flash via Zen has no documented schema-constrained mechanism.** Zen routes `deepseek-v4-flash`
   to its OpenAI-shaped `/chat/completions` endpoint, and DeepSeek's own Chat Completions reference restricts
   `response_format.type` to `text` or `json_object`. DeepSeek's JSON Schema mechanism (`json_schema`) exists
   only on its **Responses API**, which Zen does not expose for this model. Treat the fallback as **JSON mode
   plus local Zod validation**, not as schema-constrained output. Plan for a retry-on-invalid-JSON loop in the
   fallback path that the primary path does not need.
3. **"Both on free tiers" is wrong for Zen.** `deepseek-v4-flash` is paid on Zen ($0.22 in / $0.66 out per 1M
   tokens off-peak). Zen's free models are a separate, named list. Budget for it or pick a different fallback.
4. **Zod 4.4.3 output is close for Gemini, further for DeepSeek.** It already emits `additionalProperties: false`
   (contrary to the assumption in the brief), but it also emits `$schema`, `pattern`, `const`, `oneOf`, `allOf`,
   and `minLength`/`maxLength`, none of which are in either vendor's documented keyword set. Post-processing is
   required for both. Details in the Zod section.

---

## Gemini 3.1 Flash-Lite (primary)

### Endpoint

```
POST https://generativelanguage.googleapis.com/v1beta/interactions
```

Every REST example in the current docs uses `/v1beta/`
([structured output guide](https://ai.google.dev/gemini-api/docs/structured-output),
[Interactions API reference](https://ai.google.dev/api/interactions)). The reference notes that the stable `v1`
version also exists, and the version-comparison table marks **Structured Output as available in both `v1` and
`v1beta`** ([API versions](https://ai.google.dev/gemini-api/docs/api-versions)). Prefer
`https://generativelanguage.googleapis.com/v1/interactions` for a production dependency, since `v1beta` is
explicitly documented as subject to change.

The Interactions API is documented as "the recommended standard API for all new projects." The older
`generateContent` endpoint still exists, but its schema fields (`responseSchema` and `_responseJsonSchema`) are
both marked **deprecated** in its reference ([generateContent](https://ai.google.dev/api/generate-content)). Do
not build on them.

### Authentication

Header only:

```
x-goog-api-key: $GEMINI_API_KEY
```

This is the only auth form shown in the structured-output guide or the Interactions reference. A query-string
key is **not documented** on either page (see Open questions).

### Request body

Complete, minimal, working shape. `response_format` takes `type: "text"` with `mime_type: "application/json"`,
and the schema goes in `schema`
([JSON schema support](https://ai.google.dev/gemini-api/docs/structured-output),
[ResponseFormat resource](https://ai.google.dev/api/interactions)):

```bash
curl -X POST "https://generativelanguage.googleapis.com/v1/interactions" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.1-flash-lite",
    "input": "Classify the sentiment of this headline: Bitcoin ETF inflows hit a record.",
    "response_format": {
      "type": "text",
      "mime_type": "application/json",
      "schema": {
        "type": "object",
        "properties": {
          "sentiment": {
            "type": "string",
            "enum": ["positive", "neutral", "negative"]
          },
          "summary": { "type": "string" }
        },
        "required": ["sentiment", "summary"]
      }
    }
  }'
```

`system_instruction` (string) and `generation_config.max_output_tokens` are the other fields worth knowing.
Streaming is `"stream": true`; omit it for single-shot.

### Model id

`gemini-3.1-flash-lite` is real and current. It appears in the Interactions API `model` enum described as "Our
most cost-efficient model, optimized for high-volume agentic tasks, translation, and simple data processing"
([Interactions API reference](https://ai.google.dev/api/interactions)) and has its own pricing section
([pricing](https://ai.google.dev/gemini-api/docs/pricing)). `gemini-flash-lite-latest` is an alias that tracks
the newest Flash-Lite; do not use it if you need reproducibility.

### Response body and access path

```json
{
  "created": "2025-11-26T12:25:15Z",
  "id": "v1_ChdPU0F4YWFtNkFwS2kxZThQZ05lbXdROBIXT1NBeGFhbTZBcEtpMWU4UGdOZW13UTg",
  "model": "gemini-3.6-flash",
  "object": "interaction",
  "status": "completed",
  "steps": [
    {
      "type": "model_output",
      "content": [
        { "type": "text", "text": "Hello! I'm functioning perfectly..." }
      ]
    }
  ],
  "updated": "2025-11-26T12:25:15Z",
  "usage": {
    "total_input_tokens": 7,
    "total_output_tokens": 20,
    "total_tokens": 49
  }
}
```

Access path: the **last** step of `type: "model_output"`, then `content[0].text`. The reference states the SDK
convenience accessor `output_text` maps to `steps[-1].content[0].text`. Do not hard-code `steps[0]`: with tools
or thinking enabled, earlier steps exist.

The payload is a **JSON string**, so a second `JSON.parse` is required. `content[].text` is a plain string field
and `mime_type: "application/json"` describes what the model wrote into it, not the transport encoding.

Check `status === "completed"` before parsing. Other documented values include `requires_action` and `cancelled`.

### Schema dialect

The structured-output guide states "Gemini's structured output mode supports a subset of the JSON Schema
specification" and enumerates exactly this
([JSON schema support](https://ai.google.dev/gemini-api/docs/structured-output)):

| Scope                | Supported keywords                                                         |
| -------------------- | -------------------------------------------------------------------------- |
| `type` values        | `string`, `number`, `integer`, `boolean`, `object`, `array`, `null`        |
| Any schema           | `title`, `description`                                                     |
| `object`             | `properties`, `required`, `additionalProperties` (boolean **or** a schema) |
| `string`             | `enum`, `format` (only `date-time`, `date`, `time`)                        |
| `number` / `integer` | `enum`, `minimum`, `maximum`                                               |
| `array`              | `items`, `prefixItems`, `minItems`, `maxItems`                             |

Notes that matter for the implementation:

- **Null** is expressed by putting `"null"` in a type array: `{"type": ["string", "null"]}`. This is the
  documented form.
- **`anyOf` and `$ref` are used in the guide's own worked examples but are absent from the keyword list above.**
  The content-moderation example uses `anyOf` with two object branches; the recursive-structure example uses
  `{"$ref": "#"}` for self-reference. Treat both as supported, and treat `$ref` as **root self-reference only**:
  nothing in the current docs shows `$defs` or a `#/$defs/...` pointer.
- **`oneOf` and `allOf` are not mentioned anywhere** in the current structured-output docs. The deprecated
  `_responseJsonSchema` field on `generateContent` documented `oneOf` as "interpreted the same as `anyOf`"
  ([generateContent](https://ai.google.dev/api/generate-content)), which suggests the underlying engine tolerates
  it, but that is a deprecated surface. Do not emit `oneOf` or `allOf`.
- **There is no strict mode and no strict-mode conditions.** `additionalProperties: false` is allowed but not
  required, and there is no rule that every property appear in `required`. However, the troubleshooting page
  recommends "Make all output fields required" as a fix for repeated text in structured output
  ([troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting)). Do it anyway; it also aligns with
  DeepSeek's hard requirement.
- **`propertyOrdering` does not appear** in the structured-output guide or the Interactions reference. It
  survives only on the deprecated `generateContent` schema fields. Do not emit it.
- **Depth and size limits are not numeric.** The only statement is "Very large or deeply nested schemas may be
  rejected."

### Errors

Standard HTTP status codes with a body of `{"error": {"code": <string>, "message": <string>}}`. Note `code` is a
snake_case **string**, not a number ([API errors](https://ai.google.dev/gemini-api/docs/api-errors)):

| HTTP            | `code` values                                                | Classification for our provider                                                                         |
| --------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 400             | `invalid_request`, `parameter_unknown`                       | config error                                                                                            |
| 400             | `failed_precondition` (for example disabled billing)         | config error, but not a schema bug                                                                      |
| 401 / 403       | `authentication`, `permission_denied`                        | config error                                                                                            |
| 404             | `not_found`, `model_not_found`                               | config error                                                                                            |
| 416             | `out_of_range`                                               | config error (unusual status, will not match a `4xx`-minus-429 heuristic unless the range is inclusive) |
| 429             | `rate_limit_exceeded`, `quota_exceeded`, `too_many_requests` | hard failure                                                                                            |
| 499             | `cancelled`                                                  | client disconnect, not a vendor fault                                                                   |
| 500 / 503 / 504 | `api_error`, `service_unavailable`, `deadline_exceeded`      | hard failure                                                                                            |

Two things the classification rule should account for:

- **Daily quota exhaustion is a 429 (`quota_exceeded`), not a 400.** Good news for the "429 is hard failure"
  rule.
- **Any unlisted code falls back to the snake_case version of the HTTP status**, so do not switch exhaustively on
  `code`. Switch on HTTP status, use `code` for logging.

Errors are never returned as 200 for non-streaming requests. Streaming sends `{"event_type": "error", "error":
{...}}` over SSE, which is not relevant here.

**No `Retry-After` or quota header is documented.** The guidance is exponential backoff with jitter, retry only
on `429`, `408`, and `5xx`, and never retry `400` or `403`
([troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting)).

### Free tier

`gemini-3.1-flash-lite` is **free of charge on the Free Tier** for both input and output
([pricing](https://ai.google.dev/gemini-api/docs/pricing)). Two caveats: context caching and Google Search
grounding are not available on the free tier, and free-tier data is marked "Used to improve our products: Yes".

**Google no longer publishes numeric free-tier RPM/TPM/RPD.** The rate-limits page now says only that limits
"depend on a variety of factors (such as your usage tier) and can be viewed in Google AI Studio," and links to
`https://aistudio.google.com/rate-limit` ([rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)).
Limits are per project, not per API key, and RPD resets at midnight Pacific. The implementer must read the actual
numbers from AI Studio for the project in use; they cannot be pinned from documentation.

---

## DeepSeek V4 Flash via OpenCode Zen (fallback)

### The headline problem

Zen's model table routes `deepseek-v4-flash` to `https://opencode.ai/zen/v1/chat/completions` with the
`@ai-sdk/openai-compatible` package ([Zen docs](https://opencode.ai/docs/zen)). That is the **Chat Completions**
surface.

DeepSeek's own Chat Completions reference documents `response_format.type` with `Possible values: [text,
json_object]` and nothing else ([Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/)).
Schema-constrained output on DeepSeek lives on a different endpoint: the **Responses API**, where `text.format`
accepts `{"type": "json_schema", "name": ..., "schema": ...}`
([Responses API](https://api-docs.deepseek.com/api/create-response/)). Zen does not list a `/responses` route for
`deepseek-v4-flash`; it lists `/responses` only for the GPT, Grok, and Muse models.

**Conclusion: there is no documented JSON-Schema-constrained mechanism for DeepSeek V4 Flash through Zen.** The
two realistic options are below. Neither is verified against a live Zen call.

#### Option A (recommended): `json_object` mode plus local validation

DeepSeek's JSON Output guide requires three things
([JSON Output](https://api-docs.deepseek.com/guides/json_mode/)):

1. Set `response_format` to `{"type": "json_object"}`.
2. **Include the word "json" in the system or user prompt, and include an example of the desired JSON shape.**
   This is not optional advice: the reference warns that without it "the model may generate an unending stream of
   whitespace until the generation reaches the token limit."
3. Set `max_tokens` to prevent mid-string truncation.

The guide also warns the API "may occasionally return empty content" in JSON Output mode. The fallback path must
therefore validate with Zod and retry, and must treat empty content as a retryable outcome rather than a parse
crash.

Since the schema is not enforced, serialize the Zod-derived JSON Schema into the prompt as the specification.

#### Option B: forced strict tool call

DeepSeek Chat Completions supports `tools[].function.strict: true`, "to ensure the output always complies with
the function's JSON schema," combined with `tool_choice` naming that function
([Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/),
[Tool Calls guide](https://api-docs.deepseek.com/guides/tool_calls/)). The catch: DeepSeek documents that strict
mode requires `base_url="https://api.deepseek.com/beta"`, a different path segment. Whether Zen's
`/zen/v1/chat/completions` route reaches the beta backend is **not documented and was not verified**. Test before
relying on it.

### Endpoint, auth, and error shape (probed)

```
POST https://opencode.ai/zen/v1/chat/completions
Authorization: Bearer <ZEN_API_KEY>
Content-Type: application/json
```

Zen's docs describe getting an API key but do not document the header
([Zen docs](https://opencode.ai/docs/zen)). Probing the live endpoint on 2026-08-29 established:

- `Authorization: Bearer <bogus>` returns `401` with `{"type":"error","error":{"type":"AuthError","message":"Invalid API key."}}`.
- No header returns `401` with `... "message":"Missing API key."`.
- `x-api-key: <bogus>` returns "Missing API key." Zen does **not** accept the Anthropic-style header on this route.
- `?api_key=<bogus>` in the query string returns "Missing API key." Zen does **not** accept a query-string key.

Two gotchas the HTTP client must handle:

- **The error envelope is Anthropic-shaped, not OpenAI-shaped**: `{"type":"error","error":{"type":...,"message":...}}`,
  with `error.type` as a string like `AuthError`. It is not `{"error":{"message","type","code","param"}}`.
- **The error response carries `content-type: text/plain;charset=UTF-8` while the body is JSON.** Do not gate
  `JSON.parse` on the content-type header.

Whether success responses and non-401 errors use the same envelope is unverified.

The model list is public and OpenAI-shaped:
`GET https://opencode.ai/zen/v1/models` returns `{"object":"list","data":[{"id","object","created","owned_by"}]}`.

### Request and response body

Zen advertises this route as OpenAI-compatible via `@ai-sdk/openai-compatible`, and DeepSeek's own API is
"compatible with OpenAI/Anthropic" ([DeepSeek quick start](https://api-docs.deepseek.com/)). The expected shape:

```bash
curl -X POST "https://opencode.ai/zen/v1/chat/completions" \
  -H "Authorization: Bearer $ZEN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-v4-flash",
    "messages": [
      {
        "role": "system",
        "content": "Reply with json only, matching this schema exactly:\n{\"sentiment\": \"positive|neutral|negative\", \"summary\": \"string\"}\nEXAMPLE JSON OUTPUT:\n{\"sentiment\": \"positive\", \"summary\": \"Record ETF inflows.\"}"
      },
      { "role": "user", "content": "Bitcoin ETF inflows hit a record." }
    ],
    "response_format": { "type": "json_object" },
    "max_tokens": 1024,
    "stream": false
  }'
```

Response is the standard Chat Completions object. Access path: `choices[0].message.content`, which is a
**string** requiring a second `JSON.parse`. Also check `choices[0].finish_reason`: `"length"` means the JSON was
truncated by `max_tokens` and will fail to parse.

`deepseek-v4-flash` is a real DeepSeek model id on DeepSeek's own platform too, currently pointing at version
`DeepSeek-V4-Flash-0731`, with a 1M context window ([Models and pricing](https://api-docs.deepseek.com/quick_start/pricing/)).
Calling DeepSeek directly instead of through Zen uses `https://api.deepseek.com` with the same `Bearer` auth and
gives access to `/responses` and `json_schema`.

### Schema dialect (DeepSeek strict mode)

Relevant only if Option B or a direct DeepSeek `/responses` call is used. DeepSeek documents this precisely
([Tool Calls guide](https://api-docs.deepseek.com/guides/tool_calls/)):

Supported: `object`, `string`, `number`, `integer`, `boolean`, `array`, `enum`, `anyOf`, plus `$ref` and `$def`.

Hard conditions, quoted: "All properties of every `object` must be set as `required`, and the
`additionalProperties` attribute of the `object` must be set to `false`."

| Type                 | Supported                                                                                      | Explicitly unsupported   |
| -------------------- | ---------------------------------------------------------------------------------------------- | ------------------------ |
| `string`             | `pattern`, `format` (only `email`, `hostname`, `ipv4`, `ipv6`, `uuid`)                         | `minLength`, `maxLength` |
| `number` / `integer` | `const`, `default`, `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf` |                          |
| `array`              | `items`                                                                                        | `minItems`, `maxItems`   |

Things to notice, because they are the exact inverse of Gemini:

- **`date-time`, `date`, and `time` are not supported formats.** Gemini supports only those three. There is no
  overlap in the supported `format` sets between the two vendors.
- **`pattern` is supported here and absent from Gemini's list.**
- **`oneOf` and `allOf` are not listed.** Only `anyOf`.
- **The `$defs` container is spelled `$def` (singular) in DeepSeek's documentation and examples**, with pointers
  written as `"$ref": "#/$def/author"`. This is non-standard JSON Schema and is exactly what Zod does not emit.
  Whether DeepSeek also accepts standard `$defs` is unverified.
- The server validates the schema and returns an error if it "does not conform to the specifications or contains
  JSON schema types that are not supported."

Whether these same restrictions apply to the Responses API's `json_schema` format (as opposed to strict tool
calls) is not stated anywhere; the restrictions are documented only under tool calls.

### Errors and limits

Zen documents no error codes, rate limits, or retry headers at all. DeepSeek's own error table
([Error codes](https://api-docs.deepseek.com/quick_start/error_codes/)) covers its direct API:

| HTTP    | Meaning                     |
| ------- | --------------------------- |
| 400     | Invalid request body format |
| 401     | Authentication fails        |
| **402** | **Insufficient Balance**    |
| 422     | Invalid parameters          |
| 429     | Rate limit reached          |
| 500     | Server error                |
| 503     | Server overloaded           |

**402 is the unusual one.** It is a 4xx that is neither a config error nor retryable: it means the account is out
of credit. Under a rule of "429/5xx/network are hard failures, everything else 4xx is a config error," a 402
would be misfiled as a config error and would probably surface as a confusing bug report. Handle it explicitly.
Zen is prepaid with an optional auto-reload, so an equivalent condition can occur there.

DeepSeek's own limits are **concurrency-based, not request-rate-based**: 2500 concurrent requests for
`deepseek-v4-flash`, counted per account across all keys, with HTTP 429 on exceeding it
([Rate limit and isolation](https://api-docs.deepseek.com/quick_start/rate_limit/)). Whether Zen imposes its own
separate limits is undocumented.

### Free tier: it is not free

Zen's pricing table lists `DeepSeek V4 Flash` at **$0.22 in / $0.66 out per 1M tokens off-peak** and
**$0.44 / $1.32 peak** ([Zen docs](https://opencode.ai/docs/zen)). The models documented as free are:
`big-pickle`, `mimo-v2.5-free`, `hy3-free`, `ling-3.0-flash-fin-free`, `nemotron-3-ultra-free`,
`nemotron-3.5-lightning-free`, and `muse-spark-1.2-contributor-free`, all "for a limited time," and all with
data-collection caveats in Zen's privacy section.

One loose thread: the live `GET https://opencode.ai/zen/v1/models` response contains an id
**`deepseek-v4-flash-free`** that does not appear anywhere in the Zen docs page (nor does `laguna-s-2.1-free`).
Its pricing, availability, and retention policy are undocumented. Do not build on it without confirmation.

---

## Zod 4.4.3 to vendor schema

The repo pins `zod: ^4.0.0` in `apps/backend/package.json` and `apps/backtest-worker/package.json`, resolving to
**4.4.3** in `pnpm-lock.yaml`. Everything below was produced by running `z.toJSONSchema()` from the installed
4.4.3 build, not read from docs, because zod.dev currently documents 4.5 and the two differ in ways that matter.

### Default output

```js
z.toJSONSchema(z.object({ name: z.string(), age: z.number() }));
// {
//   "$schema": "https://json-schema.org/draft/2020-12/schema",
//   "type": "object",
//   "properties": { "name": { "type": "string" }, "age": { "type": "number" } },
//   "required": ["name", "age"],
//   "additionalProperties": false
// }
```

Two corrections to the assumptions in the brief:

- **Zod already emits `additionalProperties: false`.** `z.object()` strips unknown keys, so the emitted schema
  reflects that. `z.looseObject()` emits `additionalProperties: {}`; `z.strictObject()` always emits `false`.
  This holds only in the default `io: "output"` mode. In `io: "input"` mode `additionalProperties` is **omitted
  entirely**, which would silently break DeepSeek strict mode.
- **Zod does not emit `$defs` for reused subschemas by default.** The default `reused: "inline"` duplicates them.
  `$defs` appears only if you opt in with `reused: "ref"`, or if a cycle is present, or (the trap) if any
  subschema carries `.meta({ id: "..." })`, which extracts it to `$defs` unprompted.

### Options in 4.4.3

`target` (`"draft-2020-12"` default, `"draft-07"`, `"draft-04"`, `"openapi-3.0"`), `io` (`"output"` default,
`"input"`), `metadata`, `unrepresentable`, `cycles` (`"ref"` default, `"throw"`), `reused` (`"inline"` default,
`"ref"`), `override`.

**Version trap:** in 4.4.3 the type of `unrepresentable` is `"throw" | "any"` only. The callback form documented
on [zod.dev/json-schema](https://zod.dev/json-schema) is 4.5+. Passing a function to 4.4.3 does not throw; it
silently behaves like `"any"` and discards your substitute schema. Use `override` for per-type rewrites on this
version.

`target: "openapi-3.0"` is the only target that omits `$schema`, but it also switches nullability to
`{"nullable": true}`, which neither vendor documents. Do not use it as a shortcut for dropping `$schema`.

### What Zod emits that neither vendor documents

Observed on 4.4.3:

| Zod construct                                  | Emitted JSON Schema                                        | Gemini                     | DeepSeek strict                   |
| ---------------------------------------------- | ---------------------------------------------------------- | -------------------------- | --------------------------------- |
| any schema, top level                          | `$schema`                                                  | not in keyword list        | not in keyword list               |
| `z.literal("BUY")`                             | `{"type":"string","const":"BUY"}`                          | `const` not listed         | `const` listed for numbers only   |
| `z.discriminatedUnion(...)`                    | `oneOf`                                                    | not listed                 | not listed                        |
| `z.intersection(...)`                          | `allOf`                                                    | not listed                 | not listed                        |
| `z.record(...)`                                | `propertyNames` + schema-valued `additionalProperties`     | `propertyNames` not listed | not listed                        |
| `z.string().min/max`                           | `minLength` / `maxLength`                                  | not listed                 | explicitly unsupported            |
| `z.array().min/max`                            | `minItems` / `maxItems`                                    | supported                  | explicitly unsupported            |
| `z.string().regex()`                           | `pattern`                                                  | not listed                 | supported                         |
| `z.email()`                                    | `format: "email"` **plus** a long `pattern`                | neither supported          | `format` yes, `pattern` yes       |
| `z.iso.datetime()` and `z.string().datetime()` | `format: "date-time"` **plus** a long `pattern`            | `format` yes, `pattern` no | `format` no                       |
| `z.uuid()`                                     | `format: "uuid"` plus `pattern`                            | `format` no                | `format` yes, `pattern` yes       |
| `z.url()`                                      | `format: "uri"`                                            | not in the three allowed   | not in the five allowed           |
| `z.string().nullable()`                        | `{"anyOf":[{"type":"string"},{"type":"null"}]}`            | `anyOf` used in examples   | `anyOf` supported                 |
| `z.string().default("x")`                      | `{"type":"string","default":"x"}`, key stays in `required` | `default` not listed       | `default` listed for numbers only |
| `z.date()`                                     | throws `Date cannot be represented in JSON Schema`         |                            |                                   |
| cycle via getter                               | `{"$ref": "#"}`                                            | supported                  | supported                         |
| `reused: "ref"`                                | `$defs` + `#/$defs/__schema0`                              | `$defs` not documented     | container spelled `$def`          |

Note that `z.email()`, `z.iso.datetime()`, and `z.uuid()` each emit **both** `format` and a `pattern`. Even where
the `format` value is acceptable, the accompanying `pattern` is not, for Gemini.

### Optional fields

```js
z.toJSONSchema(z.object({ a: z.string(), b: z.string().optional() }));
// properties has both a and b; required is ["a"] only
```

The optional property's schema is emitted, and the key is simply absent from `required`. That is correct JSON
Schema and it is fine for Gemini. It **violates DeepSeek strict mode**, which requires every property of every
object to be listed in `required`.

### Required post-processing

Do not hand `z.toJSONSchema()` output to either vendor unmodified. Specify a transform pass with these steps.

**Shared, both vendors:**

1. Delete the top-level `$schema` key.
2. Recursively rewrite `{"const": X}` to `{"enum": [X]}` on string-typed schemas. Zod's `z.literal()` is common
   in signal enums and `const` is in neither documented keyword set.
3. Reject or rewrite `oneOf` and `allOf` before they reach a vendor. The cleanest fix is at the authoring layer:
   forbid `z.discriminatedUnion()` and `z.intersection()` in provider-facing schemas and use `z.union()` (which
   emits `anyOf`) and a flattened object instead.
4. Recursively add every key of `properties` to `required`. Required for DeepSeek, recommended by Gemini's own
   troubleshooting page. Model genuine optionality as `{"type": ["T", "null"]}` (Gemini) or an `anyOf` with a
   null branch, not as an absent `required` entry.
5. Always generate with the default `io: "output"`. `io: "input"` drops `additionalProperties`.

**Gemini-specific, applied recursively:**

6. Strip `pattern`, `minLength`, `maxLength`, `contentEncoding`, `contentMediaType`, `propertyNames`,
   `multipleOf`, `exclusiveMinimum`, `exclusiveMaximum`, and `default`. None are in the documented set.
7. Strip `format` unless its value is `date-time`, `date`, or `time`. In practice this deletes the `format` from
   `z.email()`, `z.uuid()`, and `z.url()`, so any semantic constraint they carried has to move into
   `description` text.
8. Convert Zod's `anyOf: [{type:"X"}, {type:"null"}]` nullable form into the documented `{"type": ["X","null"]}`
   form when the non-null branch is a bare type. Leave it as `anyOf` when the branch carries its own keywords.
9. Keep `reused: "inline"` (the default) and avoid `.meta({ id })` on provider-facing schemas, so no `$defs`
   block is produced. Recursion via `{"$ref": "#"}` is fine and is the one `$ref` form Gemini demonstrates.

**DeepSeek-specific (only if Option B or a direct `/responses` call is used), applied recursively:**

10. Ensure `additionalProperties: false` on every object. Zod does this in output mode, but the transform should
    assert it rather than assume it.
11. Strip `minLength`, `maxLength`, `minItems`, `maxItems`. All four are explicitly unsupported.
12. Strip `format` unless its value is `email`, `hostname`, `ipv4`, `ipv6`, or `uuid`. This deletes `date-time`,
    `date`, and `uri`.
13. Keep `pattern`. It is supported and is the natural replacement for the string formats removed in step 12.
14. If any `$defs` survive, rename the container to `$def` and rewrite `#/$defs/X` pointers to `#/$def/X`, per
    DeepSeek's documented spelling. Simpler: avoid `$defs` entirely, as in step 9.

**Authoring guidance that removes most of this work.** If provider-facing Zod schemas are restricted to
`z.object` / `z.string` / `z.number` / `z.int` / `z.boolean` / `z.array` / `z.enum` / `z.union` / `.describe()`,
with no `.optional()`, no `.default()`, no `z.literal()`, no `z.record()`, no `z.date()`, no string-format
helpers, and no `.min()` / `.max()`, then the only mandatory transform is deleting `$schema`. Enforce that
restriction in the provider's public type rather than writing a large, permanently-drifting sanitizer.

---

## Open questions

Things this note could not settle against a primary source. Verify before depending on them.

1. **No live call was made to either generation endpoint.** No API keys were available. Every Gemini request and
   response shape here comes from the official reference and guide, not from an observed round trip.
2. **Whether Gemini accepts an API key in the query string.** The current Interactions API pages document only
   the `x-goog-api-key` header. Older `?key=` behavior was neither confirmed nor denied by the pages read.
3. **Whether Gemini rejects or silently ignores unlisted keywords** such as `$schema`, `pattern`, `const`, and
   `oneOf`. The docs say only that the supported set is a subset and that large or deeply nested schemas "may be
   rejected." The transform above strips them defensively; a single probe call would tell you whether that is
   necessary.
4. **Gemini free-tier numeric limits (RPM, TPM, RPD).** No longer published in documentation; only visible in AI
   Studio for the specific project.
5. **Whether OpenCode Zen passes `response_format` through to DeepSeek at all**, and whether it passes
   `tools[].function.strict`. Zen publishes no request-body reference for any route. Its docs page lists only
   endpoints, model ids, prices, and AI SDK package names.
6. **Whether Zen's `/zen/v1/chat/completions` reaches DeepSeek's `/beta` backend**, which DeepSeek states is
   required for strict-mode tool calls.
7. **Zen's success-response envelope, non-401 error shapes, rate limits, and any retry headers.** Only the 401
   shape was observed by probing.
8. **The undocumented `deepseek-v4-flash-free` model id** returned by `GET https://opencode.ai/zen/v1/models`.
   Pricing, limits, and data-retention terms are unknown.
9. **Whether DeepSeek accepts standard `$defs` in addition to the `$def` spelling** used throughout its docs.
10. **Whether DeepSeek's strict-mode schema restrictions also govern the Responses API's `json_schema` format.**
    They are documented only under tool calls.
