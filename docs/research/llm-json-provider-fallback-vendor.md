# LLM JSON Provider fallback vendor

**Researched:** 2026-08-29
**Scope:** Finding a replacement secondary (fallback) provider for the schema-constrained JSON module, after
DeepSeek V4 Flash via OpenCode Zen was disqualified in
[llm-json-provider-wire-formats.md](./llm-json-provider-wire-formats.md). Hard requirements: real JSON Schema
constrained decoding, a standing free tier, not Google, callable from Node 24 with plain `fetch`. Gemini 3.1
Flash-Lite as primary is settled and out of scope. No API keys were available, so no authenticated generation
call was made; facts marked "probed" come from unauthenticated requests.

## Recommendation

**Use Groq with `openai/gpt-oss-20b` and `response_format.json_schema.strict: true`.** It is the only candidate
that passes all four hard requirements without a caveat.

1. **Real constrained decoding, stated in those words.** Groq's reference says `strict: true` "uses constrained
   decoding to guarantee that the output will always match your schema exactly" and "Never errors or produces
   invalid JSON" ([Structured Outputs](https://console.groq.com/docs/structured-outputs)). This is a stronger
   guarantee than Gemini's, so the fallback path needs **no** retry-on-invalid-JSON loop, unlike the DeepSeek
   Option A design the prior note had to plan for.
2. **Standing free plan with published per-model numbers**, not credits: 30 RPM, 1K RPD, 8K TPM, 200K TPD on
   `openai/gpt-oss-20b` ([Rate limits](https://console.groq.com/docs/rate-limits)). Nothing in Groq's docs
   describes the Free plan as trial credits or as expiring.
3. **Contractual no-training**, which is better than the primary: "Groq is not permitted to use Inputs or Outputs
   for training or fine-tuning any AI Model Services or other models"
   ([Services Agreement](https://console.groq.com/docs/legal/services-agreement)), and "By default, Groq does not
   retain customer data for inference requests" ([Your Data](https://console.groq.com/docs/your-data)). Gemini's
   free tier is marked "Used to improve our products: Yes".
4. **Plain OpenAI-shaped HTTP.** One `fetch` to `https://api.groq.com/openai/v1/chat/completions`, `Authorization:
Bearer`. No SDK.

The one real cost: **8,000 TPM on the free plan is the binding constraint for batch news scoring.** At roughly
800 tokens per article body that is about ten items per minute of input budget before output tokens, and 200K TPD
caps a day's crawl at roughly 200 such calls. Size the batch loop against TPM, not RPM.

Second choice if Groq's TPM proves too tight: **Cohere**, which has the widest schema dialect of anything tested
but only 1,000 API calls per month and trains on trial-key data unless you opt out.

## Candidates

| Vendor                           | 1. Schema-constrained                               | 2. Genuinely free                            | 3. Not Google | 4. Plain fetch                           | Verdict                   |
| -------------------------------- | --------------------------------------------------- | -------------------------------------------- | ------------- | ---------------------------------------- | ------------------------- |
| **Groq**                         | Pass, `strict: true` constrained decoding           | Pass, standing Free plan, published limits   | Pass          | Pass, OpenAI-compatible                  | **Recommended**           |
| **Cohere**                       | Pass, "100% of the time"                            | Pass, trial key, 1,000 calls/month           | Pass          | Pass, but non-standard `response_format` | Runner-up                 |
| Mistral La Plateforme            | Pass, `json_schema` + `strict`                      | Pass, $10/mo API credits, no card            | Pass          | Pass                                     | Viable, trains by default |
| OpenRouter free tier             | Partial, per-endpoint, not guaranteed by OpenRouter | Partial, 50 RPD unless you buy $10 of credit | Pass          | Pass                                     | Not recommended           |
| Cloudflare Workers AI            | **Fail**, "can't guarantee"                         | Pass, 10,000 Neurons/day                     | Pass          | Pass                                     | Fails req 1               |
| SambaNova Cloud                  | **Fail**, `strict` is a no-op                       | Pass, but 20 requests/day                    | Pass          | Pass                                     | Fails req 1               |
| Cerebras                         | Pass                                                | **Fail**, $5 credits expiring in 30 days     | Pass          | Pass                                     | Fails req 2               |
| NVIDIA build.nvidia.com          | Not verified                                        | **Fail**, 1,000 expiring credits             | Pass          | Pass                                     | Fails req 2               |
| Fireworks                        | Pass                                                | **Fail**, $1 then account suspension         | Pass          | Pass                                     | Fails req 2               |
| Together AI                      | Pass                                                | **Fail**, no free tier documented            | Pass          | Pass                                     | Fails req 2               |
| Hugging Face Inference Providers | Depends on routed provider                          | **Fail in practice**, $0.10/month            | Pass          | Pass                                     | Fails req 2               |
| GitHub Models                    | n/a                                                 | n/a                                          | Pass          | n/a                                      | **Retired 2026-07-30**    |
| Any Gemini route                 | n/a                                                 | n/a                                          | **Fail**      | n/a                                      | Disqualified by design    |

---

## Groq (recommended fallback)

### Endpoint

```
POST https://api.groq.com/openai/v1/chat/completions
```

The OpenAPI document embedded in the docs site declares `servers: [{"url": "https://api.groq.com"}]` with the
path `/openai/v1/chat/completions`. There is no unversioned or `v2` alternative. A `/openai/v1/responses` route
exists but is labelled "Responses (beta)"; do not build on it.

### Authentication

```
Authorization: Bearer $GROQ_API_KEY
Content-Type: application/json
```

Probed 2026-08-29: `GET https://api.groq.com/openai/v1/models` with no auth header returns `401` with
`{"error":{"message":"Invalid API Key","type":"invalid_request_error","code":"invalid_api_key"}}`. Note the live
envelope carries a `code` field that the [error docs](https://console.groq.com/docs/errors) do not show.

### Model id

`openai/gpt-oss-20b`. It is a **Production Model** ("intended for use in your production environments"), 131,072
context, 65,536 max completion tokens ([Models](https://console.groq.com/docs/models)).

`openai/gpt-oss-120b` is the other production model with strict mode and has identical free limits, so it is a
drop-in swap if 20B's output quality disappoints. `qwen/qwen3.8-27b` also supports strict mode and has a 10x
higher free TPD (2M), but it is a **Preview Model**: "for evaluation purposes only and should not be used in
production environments as they may be discontinued at short notice." Do not pick it for something that has to
work at demo time.

### Request body

Complete, minimal, schema-constrained call:

```bash
curl -X POST "https://api.groq.com/openai/v1/chat/completions" \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-oss-20b",
    "messages": [
      { "role": "system", "content": "Classify the sentiment of the headline." },
      { "role": "user", "content": "Bitcoin ETF inflows hit a record." }
    ],
    "response_format": {
      "type": "json_schema",
      "json_schema": {
        "name": "headline_sentiment",
        "strict": true,
        "schema": {
          "type": "object",
          "properties": {
            "sentiment": { "type": "string", "enum": ["positive", "neutral", "negative"] },
            "summary": { "type": "string" }
          },
          "required": ["sentiment", "summary"],
          "additionalProperties": false
        }
      }
    },
    "stream": false
  }'
```

Field rules from the OpenAPI schema `ResponseFormatJsonSchema`:

- `type` and `json_schema` are both required.
- Inside `json_schema`, only `name` is required. `name` "Must be a-z, A-Z, 0-9, or contain underscores and dashes,
  with a maximum length of 64."
- `strict` **defaults to `false`**. Omitting it silently gives you best-effort mode, which "May produce valid JSON
  that does not match your schema." Always send `strict: true` explicitly.
- Optional `description` on `json_schema`, "used by the model to determine how to respond in the format."

**Streaming and tool use are not supported with Structured Outputs.** That is fine for single-shot, but it means
you cannot combine schema output with function calling in one request.

### Response body and access path

```json
{
  "id": "chatcmpl-f51b2cd2-bef7-417e-964e-a08f0b513c22",
  "object": "chat.completion",
  "created": 1730241104,
  "model": "openai/gpt-oss-20b",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "{\"sentiment\":\"positive\",...}"
      },
      "logprobs": null,
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "queue_time": 0.037493756,
    "prompt_tokens": 18,
    "prompt_time": 0.000680594,
    "completion_tokens": 556,
    "completion_time": 0.463333333,
    "total_tokens": 574,
    "total_time": 0.464013927
  },
  "system_fingerprint": "fp_179b0f92c9",
  "x_groq": { "id": "req_01jbd6g2qdfw2adyrt2az8hz4w" }
}
```

Access path: `choices[0].message.content`. It is a **string**, so a second `JSON.parse` is required. The docs'
own JS example is `JSON.parse(response.choices[0].message.content || "{}")`.

Check `choices[0].finish_reason` before parsing. `"length"` means truncation by the token cap and the JSON will
not parse even under strict mode. Log `x_groq.id` for support tickets.

### Schema dialect

The documented supported set is narrow and is enumerated as data types rather than keywords
([Structured Outputs](https://console.groq.com/docs/structured-outputs)):

| Scope           | Supported                                                        |
| --------------- | ---------------------------------------------------------------- |
| Primitives      | `string`, `number`, `boolean`, `integer`                         |
| Complex         | `object`, `array`, `enum`                                        |
| Composition     | `anyOf`                                                          |
| References      | `$defs` with `#/$defs/name` pointers, and `#` for root recursion |
| Object keywords | `properties`, `required`, `additionalProperties`                 |
| Annotation      | `description` (used throughout the docs' examples)               |
| Null            | type arrays, `{"type": ["string", "null"]}`                      |

**Nothing else is documented.** `pattern`, `minLength`, `maxLength`, `minItems`, `maxItems`, `minimum`,
`maximum`, `multipleOf`, `format`, `const`, `default`, `title`, `oneOf`, `allOf`, `prefixItems`, and
`propertyNames` do not appear anywhere in the page's prose. Treat all of them as unsupported.

Strict-mode conditions, quoted:

- "All schema properties must be marked as `required`. Optional fields are not supported."
- "All objects must set `additionalProperties: false` to prevent undefined properties."
- Optionality is expressed as `{"type": ["string", "null"]}` **with the key still listed in `required`**.

Two points where Groq is better than both vendors in the prior note:

- **`$defs` is standard-spelled and documented**, with both `#/$defs/name` pointers and `#` root recursion shown
  in worked examples. Gemini documents no `$defs` at all; DeepSeek spells it `$def`. Groq is the one vendor where
  Zod's `reused: "ref"` output would work unmodified.
- **Both nullability forms are documented**: `anyOf` with a `{"type":"null"}` branch appears in the recursive
  file-tree example, and the type-array form appears in the optional-fields example. So Zod's `anyOf` nullable
  output needs no rewriting, unlike for Gemini.

No numeric limit on schema depth or size is published.

### Errors

Documented status codes ([Error codes](https://console.groq.com/docs/errors)): 200, 206, 400, 401, 403, 404, 413,
422, 424, 429, 498 (Flex Tier capacity exceeded), 499 (request cancelled), 500, 502, 503.

Documented body shape:

```json
{ "error": { "message": "...", "type": "invalid_request_error" } }
```

Probed responses also include `error.code` (for example `invalid_api_key`). Do not require `code` to be present,
and do not require it to be absent.

Classification for the provider abstraction:

| HTTP            | Handling                                                                                                                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400             | Config error. In **best-effort** mode this is also how schema-validation failure surfaces ("Generated JSON does not match the expected schema"). Under `strict: true` a 400 means a malformed schema, not a bad generation. |
| 401 / 403 / 404 | Config error                                                                                                                                                                                                                |
| 413 / 422       | Config error (payload too large, bad parameters)                                                                                                                                                                            |
| 424             | Failed dependency, treat as hard failure                                                                                                                                                                                    |
| 429             | Hard failure. `retry-after` (seconds) is set **only** on 429.                                                                                                                                                               |
| 498             | Flex-tier capacity. Not reachable on the Free plan, which has no Flex tier.                                                                                                                                                 |
| 499             | Client cancelled, not a vendor fault                                                                                                                                                                                        |
| 5xx             | Hard failure                                                                                                                                                                                                                |

Rate-limit headers are always present except `retry-after`:
`x-ratelimit-limit-requests` (RPD), `x-ratelimit-limit-tokens` (TPM), `x-ratelimit-remaining-requests` (RPD),
`x-ratelimit-remaining-tokens` (TPM), `x-ratelimit-reset-requests`, `x-ratelimit-reset-tokens`. Reset values are
duration strings such as `2m59.56s`, not timestamps. This is strictly better than Gemini, which publishes no
quota header at all, so the fallback path can pre-emptively back off.

### Free tier

Published per model on the Free Plan tab of [Rate limits](https://console.groq.com/docs/rate-limits):

| Model                        | RPM | RPD   | TPM   | TPD       |
| ---------------------------- | --- | ----- | ----- | --------- |
| `openai/gpt-oss-20b`         | 30  | 1,000 | 8,000 | 200,000   |
| `openai/gpt-oss-120b`        | 30  | 1,000 | 8,000 | 200,000   |
| `qwen/qwen3.8-27b` (Preview) | 30  | 1,000 | 8,000 | 2,000,000 |

Limits apply at the **organization** level, not per key or per user. Cached tokens do not count.

Data terms: no training on inputs or outputs (Services Agreement, quoted above); inference requests not retained
by default; troubleshooting and abuse logs kept up to 30 days; Zero Data Retention available to all customers in
Data Controls. The docs draw no free-versus-paid distinction on any of this.

**Credit card: not explicitly documented for the Free plan.** The [Billing FAQs](https://console.groq.com/docs/billing-faqs)
state that a valid payment method is required to _upgrade_ to the Developer plan, and say nothing about the Free
plan requiring one. That is suggestive but not a statement. See Open questions.

---

## Zod 4.4.3 to Groq schema

What Zod 4.4.3 emits is settled in the [prior note](./llm-json-provider-wire-formats.md#zod-443-to-vendor-schema)
and is not re-derived here. This section says only what Groq accepts and therefore what must change.

Groq needs **fewer** transforms than either vendor in the prior note. Of the shared steps there, only these apply:

1. **Delete the top-level `$schema`.** Not in Groq's documented set.
2. **Rewrite `{"const": X}` to `{"enum": [X]}`.** `const` is undocumented for Groq at every type, so this is
   mandatory, not merely tidy. `z.literal()` in signal enums is the common source.
3. **Reject `oneOf` and `allOf`.** Fix at the authoring layer: forbid `z.discriminatedUnion()` and
   `z.intersection()` in provider-facing schemas; use `z.union()` (emits `anyOf`, which Groq supports) and a
   flattened object.
4. **Recursively add every key of `properties` to `required`.** Groq strict mode requires it in the same absolute
   terms DeepSeek does. Model genuine optionality as `{"type": ["T", "null"]}`, keeping the key in `required`.
5. **Generate with the default `io: "output"`** so `additionalProperties: false` is emitted. Then assert it on
   every object rather than assuming it.

Groq-specific, applied recursively:

6. **Strip `pattern`, `minLength`, `maxLength`, `minItems`, `maxItems`, `minimum`, `maximum`, `multipleOf`,
   `exclusiveMinimum`, `exclusiveMaximum`, `default`, `propertyNames`, `prefixItems`, and `title`.** None appear
   in Groq's documented set. Note `minItems`/`maxItems` differ from Gemini, which supports them, so this cannot
   be a shared strip list with the primary.
7. **Strip `format` unconditionally.** Groq documents no `format` values at all, so this removes it from
   `z.email()`, `z.uuid()`, `z.iso.datetime()`, and `z.url()`. Move the semantic constraint into `description`
   text, which Groq does use.

Two Gemini-specific steps that Groq does **not** need:

- **No `anyOf`-to-type-array conversion.** Zod's `{"anyOf":[{"type":"string"},{"type":"null"}]}` nullable form is
  directly supported.
- **No avoidance of `$defs`.** `reused: "ref"` is safe here, and so is `.meta({ id })`. If you want one sanitizer
  shared with the Gemini path, keeping `reused: "inline"` (the default) still works for Groq and avoids a
  vendor-conditional branch.

**Net effect of the authoring restriction already recommended in the prior note** (only `z.object` / `z.string` /
`z.number` / `z.int` / `z.boolean` / `z.array` / `z.enum` / `z.union` / `.describe()`, no `.optional()`, no
`.default()`, no `z.literal()`, no `z.record()`, no `z.date()`, no format helpers, no `.min()` / `.max()`): the
only mandatory transforms left for Groq are step 1 (delete `$schema`) and step 4 (fill `required`). That is the
same end state the primary needs, so one sanitizer serves both providers.

---

## Why the runners-up lost

### Cohere (closest alternative)

Passes all four hard requirements and has by far the **widest schema dialect** of anything tested. Loses on
throughput and data terms.

- Genuine enforcement: "the LLM will generate structured data that follows the desired schema, provided by the
  user, 100% of the time" ([Structured Outputs](https://docs.cohere.com/docs/structured-outputs)).
- **Non-standard request shape.** It is `response_format: {"type": "json_object", "schema": {...}}`, not
  `type: "json_schema"`. Adding Cohere means the provider abstraction cannot assume one OpenAI-shaped body.
- Supported that Groq does not document: `const` (for int, float, bool, None, str), `pattern`, `format`
  (`date-time`, `uuid`, `date`, `time`), `$ref`, `$def`, `additionalProperties`, `enum`, `anyOf`, nested objects,
  arrays including lists of lists.
- Explicitly unsupported: `allOf`, `oneOf`, `not`, `maximum`, `minimum`, `minItems`, `maxItems`, string length
  limits, `uniqueItems`, and most regex constructs.
- Two hard constraints: "The type in the top level schema must be object" and "Every object in the schema must
  have at least one required field specified." Notably it does **not** require every property in `required`.
- Free tier: trial key, 20 req/min on Chat, and "Trial keys (and prod keys on newer Chat model variants) are
  limited to 1,000 API calls a month" ([Rate limits](https://docs.cohere.com/docs/rate-limits)). 1,000 calls per
  month is the real ceiling.
- Data: trial-key prompts and generations are **opted in to training by default**, with opt-out in the dashboard
  and 30-day deletion of logs ([Data usage policy](https://cohere.com/data-usage-policy)).

### Mistral La Plateforme

Passes all four, ranked below Cohere only because its free ceiling is unpublished and its default data posture is
the worst of the three.

- `response_format: {"type": "json_schema", "json_schema": {"name": ..., "strict": true, "schema": {...}}}`, and
  "All currently available models except for `codestral-mamba` are supported"
  ([Custom Structured Outputs](https://docs.mistral.ai/studio/conversations/structured-output/custom)).
- Free mode: "API access is enabled by default with no credit card required"
  ([Activate Studio](https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key)),
  and the Free plan lists "$10/mo in API credits" ([pricing](https://mistral.ai/pricing/)). A renewing monthly
  allowance, not expiring signup credits.
- **Numeric rate limits are no longer published.** The docs say only that limits are "shown in Admin Panel > API >
  Limits" ([Usage and limits](https://docs.mistral.ai/admin/user-management-finops/tier)). Same problem as
  Gemini's free tier.
- Data: free mode is opted **in** to training by default, opt-out via the Privacy menu in the Admin panel
  ([opt-out FAQ](https://help.mistral.ai/en/articles/455207-can-i-opt-out-of-my-input-or-output-data-being-used-for-training)).
  Preview and Labs models are excluded from the opt-out entirely.

### OpenRouter free tier

- Probed 2026-08-29: `GET https://openrouter.ai/api/v1/models` (public, unauthenticated) returns 396 models, 18
  with a `:free` suffix, of which **4** advertise `structured_outputs` in `supported_parameters`:
  `dots-studio/dots-3-note-preview:free`, `liquid/lfm-2.5-2.6b:free`, `z-ai/glm-5.2:free`, and
  `nvidia/nemotron-3-super-120b-a12b:free`.
- **Free rate limit is 50 requests per day** without a lifetime credit purchase, rising to 1,000/day only after
  buying at least 10 credits ([Limits](https://openrouter.ai/docs/api-reference/limits)). Paying $10 to unlock a
  usable free tier is not a free tier.
- OpenRouter's own reference never claims enforcement; it says only "Structured outputs are supported by select
  models" and tells you to set `require_parameters: true` so routing avoids endpoints that lack it
  ([Structured Outputs](https://openrouter.ai/docs/features/structured-outputs)). Whether any given free endpoint
  does constrained decoding is a property of the upstream provider, and OpenRouter will silently reroute. For a
  fallback whose entire job is to be predictable, that is the wrong shape.
- Data: "There are separate settings for paid and free models" for training-on-prompts routing
  ([Privacy and logging](https://openrouter.ai/docs/features/privacy-and-logging)). What the free-model default is
  could not be determined from the docs.

### Cloudflare Workers AI (fails requirement 1)

Accepts `response_format: {"type": "json_schema", "json_schema": {...}}` and has a genuinely standing free
allocation of "10,000 Neurons per day at no charge"
([pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)). But the JSON Mode page (last updated
2026-04-21) states plainly: "Note that Workers AI can't guarantee that the model responds according to the
requested JSON Schema... If that's the case, then an error `JSON Mode couldn't be met` is returned and must be
handled" ([JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode/)). That is an explicit
disclaimer of the guarantee this module exists to get. The supported-model list is also stale (Llama 3.1/3.3,
Hermes 2 Pro, DeepSeek Coder 6.7B).

### SambaNova Cloud (fails requirement 1)

Accepts the OpenAI `json_schema` shape, but its own reference says `strict: false` "is the only value with active
enforcement today; the model uses best-effort matching against your schema," and `strict: true` is "accepted
without error but has no additional behavioral impact at this time"
([Function calling](https://docs.sambanova.ai/docs/en/features/function-calling)). Best-effort only, which is the
same failure mode as DeepSeek-via-Zen. Separately, the Free Tier is **20 requests per day**
([Rate limits](https://docs.sambanova.ai/docs/en/models/rate-limits)), which would not survive one news crawl.

### Cerebras (fails requirement 2)

Real constrained decoding at the token level, and a clean OpenAI-shaped `json_schema` field. But there is no
standing free tier: "New accounts receive $5 in free credits after adding a verified payment method. These credits
expire 30 days after they're granted," and the FAQ is explicit that "the Free Trial is time- and credit-bounded"
([Rate limits](https://inference-docs.cerebras.ai/support/rate-limits)). Requires a verified payment method up
front, which also fails the credit-card question.

### NVIDIA build.nvidia.com, Fireworks, Together AI, Hugging Face (fail requirement 2)

- **NVIDIA:** 1,000 credits on registration, and NVIDIA's own developer forums carry expiry notices for them. No
  standing free tier documented. The NIM structured-generation reference page could not be retrieved.
- **Fireworks:** $1 in credits, after which "your account will be suspended until you add a payment method."
- **Together AI:** neither the pricing page nor the quickstart documents a free tier, free credits, or $0 models.
- **Hugging Face Inference Providers:** free accounts get "$0.10, subject to change" per month
  ([pricing](https://huggingface.co/docs/inference-providers/en/pricing)). It renews rather than expiring, so it
  is technically standing, but ten cents a month is not a fallback budget. Schema enforcement would also depend
  on whichever upstream provider HF routes to, the same objection as OpenRouter.

### GitHub Models (retired)

"As of July 30, 2026, GitHub Models has been fully retired. The playground, model catalog, inference API, and
bring your own key (BYOK) are no longer available to any customer"
([GitHub docs](https://docs.github.com/en/github-models/use-github-models/prototyping-with-ai-models)).

### Anything Google

Disqualified by design per the brief. Not evaluated.

---

## Open questions

Things this note could not settle against a primary source.

1. **No live call was made to any generation endpoint.** No API keys were available. Every Groq request and
   response shape here comes from the official reference and the OpenAPI document embedded in its docs site, not
   from an observed round trip.
2. **Whether Groq's Free plan requires a credit card.** The Billing FAQs document a payment-method requirement
   only for upgrading to the Developer plan and say nothing about the Free plan. Not a positive statement either
   way.
3. **Whether `strict: true` structured outputs are available on the Free plan specifically.** The gpt-oss models
   are listed on the Free Plan rate-limit table, and nothing gates the feature by plan in the docs, but no doc
   says so explicitly.
4. **Whether Groq rejects or silently ignores unlisted schema keywords** such as `$schema`, `pattern`, `const`,
   `format`, and `oneOf`. The docs enumerate a supported subset without saying what happens to the rest. The
   transform above strips them defensively; one probe call would tell you whether that is necessary.
5. **Groq schema depth and size limits.** No numeric limit is published.
6. **Groq's refusal field.** The Structured Outputs page lists "Programmatic refusal detection" as a benefit, but
   no `refusal` field appears anywhere in the chat-completion response schema in the embedded OpenAPI. How a
   refusal actually surfaces is undocumented.
7. **Whether Groq's Free plan has any expiry.** Nothing in the docs says it does, and it is described as
   rate-limited rather than credit-based, but no page states affirmatively that it is permanent.
8. **Mistral free-mode numeric rate limits (RPS, TPM).** Visible only in the Admin Panel for the specific
   organization.
9. **Cohere trial-key commercial-use restriction and expiry.** Current docs mention neither. Older Cohere terms
   restricted trial keys to non-commercial use; whether that still applies was not confirmed.
10. **OpenRouter's default training setting for free models**, and whether any of the 4 free structured-output
    endpoints does true constrained decoding upstream.
