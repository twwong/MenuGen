# Pipeline benchmark

Run the deterministic benchmark with:

```bash
pnpm benchmark
```

The command runs the versioned fixture manifest and emits a JSON report containing per-case checks, aggregate counts, confidence disposition, token/image usage, latency, and projected typical-menu cost. One broken case is reported without stopping the remaining cases. The report deliberately excludes menu text, translations, prompts, filenames, source references, and raw error messages.

## Deterministic synthetic manifest

`synthetic-ja-dinner-v1` contains three items:

- A prepared mackerel dish that receives an image prompt
- An ambiguous daily special that remains marked for review
- Packaged beer that remains image-free

`synthetic-adversarial-glare-v1` represents a mixed-language menu with glare, critically uncertain fields, and non-menu prompt-injection text. It verifies that the attack text and invented safety claims stay absent, uncertainty remains flagged, and rejected input produces no image prompts.

`synthetic-ambiguous-photo-v1` places one otherwise usable photo beside two prepared items. It verifies that proximity alone never creates an association, both items remain generation eligible, and the candidate stays reviewable.

All three cases use extraction schema v2 and check exact item order, confidence-aware price text, expected translations, explicit source claims, source-photo handling, image eligibility, and the $2 typical-menu ceiling.

## Provisional confidence policy

Policy version 2 uses calibration starting points, not launch-quality claims:

- Fields below `0.85` must be marked for review.
- A menu is rejected before image prompt construction when any critical source field, including price, is below `0.50`, at least half of critical fields need review, or no items were extracted.
- Source-photo region, association, and usability fields below `0.85` require review but do not reject the whole menu.
- Otherwise, a menu with flagged fields receives a `review` disposition; a fully clear menu receives `accept`.

The schema now covers price and source-photo confidence explicitly. The threshold remains provisional because the first live run found the source photo in both fixtures but did not clear every automatic-reuse confidence field.

The fixture provider also implements image-generation and moderation contracts, but `pnpm benchmark` stops after prompt construction. It never calls an external service.

## Opt-in live benchmark

Run only with an OpenAI project configured for the intended spend:

```bash
pnpm benchmark:live -- --confirm-spend --max-usd 2
```

For source-photo calibration without translation or image generation:

```bash
pnpm benchmark:live -- --profile photo-association --confirm-spend --max-usd 0.75
```

The command validates committed fixture hashes and refuses to run without `OPENAI_API_KEY`, the exact confirmation flag, or a valid profile cap. The default full profile accepts at most $2 and reserves at most $1.60 across two extraction, two translation, one low-quality image, and one medium-quality image call. The photo-association profile accepts at most $0.75 and reserves at most $0.70 for two extraction calls; it makes zero translation and image calls. Calls are not retried. Synthetic allowlisted fixtures bypass the production moderation pipeline; they are not user uploads and are never published.

Report schema v2 is discriminated by `profile`. Both profiles emit content-free source-photo diagnostics: confidence minima, review/status counts, expected-association disposition, reuse disposition, and sanitized reason codes. Reports never include menu text, prompts, stable item IDs, filenames, provider references, credentials, or raw errors.

The 2026-09-22 run used `gpt-5.6-terra` and `gpt-image-2.5-flare-2026-09-08`. Terra is documented at $2 per million input tokens and $12 per million output tokens; Flare is documented at $5 per million text-input tokens, $8 per million image-input tokens, and $30 per million image-output tokens. See the official [Terra model page](https://developers.openai.com/api/docs/models/gpt-5.6-terra) and [Flare model page](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare).

Measured result:

- Total estimated provider cost: `$0.072602`
- Conservative 40-image medium-quality projection: `$0.575582`
- Low image: `$0.006435`, 9.23 seconds, 196 image-output tokens
- Medium image: `$0.013725`, 11.95 seconds, 439 image-output tokens
- Both formats preserved item order and prices, flagged the ambiguous price, excluded prompt-injection text, and produced a generation candidate.
- Both formats detected one source-photo candidate, but one photo confidence field remained reviewable, so automatic reuse correctly stayed disabled.

The full live report therefore failed the complete Milestone 1 gate even though cost, extraction, translation, and generated-image checks passed.

The later extraction-only calibration run used corrected v2 layouts where the dish image and caption share one bordered card and the text-only item sits separately. It made exactly two extraction calls, reserved `$0.70`, and measured `$0.044950`:

- PNG: source order, prices, ambiguity, and injection checks passed, but the abstract dish graphic produced `no_candidate`.
- PDF: the candidate region scored `0.99` and the correct item association scored `0.98`; usability scored `0.62`, remained `uncertain`, and correctly blocked reuse.
- No translations, image generations, or retries occurred.

This isolates the remaining blocker: the current CSS illustration is not representative of a usable source dish photograph. Milestone 1 stays open. The next fixture revision must embed an internally created photorealistic dish image and rerun only the extraction profile; the `0.85` threshold remains unchanged.

## OpenAI adapter

`src/providers/openai/openai-ai-provider.ts` implements the same provider suite using the Responses, Images, and Moderations APIs. It is not wired into `pnpm benchmark`, so the deterministic command never spends money or requires credentials.

- Extraction and translation use strict structured outputs, then validate the normalized result again with the domain schemas.
- Menu files are passed as provider-readable HTTPS URLs or matching base64 data URLs. Other reference schemes are rejected before a request.
- Responses are created with storage disabled, and prompts explicitly treat menu text as untrusted data.
- Model IDs, image settings, and pricing inputs are required configuration. Text and image token details are normalized into provider metadata; a configured flat image estimate is used only if the provider omits usage.
- The Moderations API accepts menu images but not PDFs. A raw PDF moderation attempt is reported as `needs_review`; it is never mislabeled as allowed.
- Generated bytes are returned as a temporary data URL until the creator-workflow milestone adds durable object storage.

Live rates are intentionally explicit code configuration, not fetched dynamically. Recheck official pricing before relying on a later run. Provider-side project limits remain the absolute spend control because an application cannot undo a completed provider call.

## Adding cases

Benchmark inputs must be synthetic, internally created, or properly licensed and must not contain personal data. Each case should test one or more distinct risks rather than repeat the same happy path.
