# ADR 0002: OpenAI benchmark profile

- Status: Accepted with one open benchmark gate
- Date: 2026-09-22
- Source: `prd.md` sections 12.3, 12.5, 15, and 16

## Context

Milestone 1 must prove structured multimodal extraction, translation, source-photo association, image quality, and a typical 40-item cost below $2 before the creator workflow is built around the pipeline.

## Decision

- Use `gpt-5.6-terra` for extraction and translation with strict schema-v2 outputs, high-detail file input, storage disabled, and a 6,000-token output ceiling.
- Use the dated `gpt-image-2.5-flare-2026-09-08` snapshot at `1024x1024` WebP for image benchmarking.
- Use low quality as the provisional MVP default. In the first run it was visually comparable to medium while costing about half as much and returning faster.
- Keep the source-photo automatic-reuse threshold at `0.85`. A candidate must have confident region, association, and usability fields; uncertain candidates remain visible for review.
- Keep live execution outside CI and require an explicit confirmation flag, fixture hashes, no retries, and an application reservation cap no greater than $2.
- Use the `photo-association` profile for calibration changes. It permits two extraction calls, zero translation/image calls, a `$0.70` reservation, and a `$0.75` maximum cap.
- Use report schema v2 with a profile discriminator and content-free source-photo confidence, review, status, and reason-code diagnostics.

Official OpenAI documentation lists Terra at $2 per million input tokens and $12 per million output tokens, with image input and structured outputs supported. Flare supports the pinned snapshot and low/medium quality, at $5 per million text-input tokens and $30 per million image-output tokens. See the [Terra documentation](https://developers.openai.com/api/docs/models/gpt-5.6-terra), [Flare documentation](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare), and [file-input guide](https://developers.openai.com/api/docs/guides/file-inputs).

## Evidence

The 2026-09-22 synthetic PNG/PDF run made the planned six calls for an estimated `$0.072602`. The conservative medium-quality 40-image projection was `$0.575582`.

Both formats preserved five-item order and exact prices, flagged the ambiguous price, ignored the embedded prompt injection, and left the text-only dish eligible for generation. Low and medium images were both recognizable; low cost `$0.006435` at 9.23 seconds and medium cost `$0.013725` at 11.95 seconds.

Both inputs produced a source-photo candidate, but one photo confidence field remained below the automatic-reuse gate. The adapter correctly refused to reuse it. Milestone 1 therefore remains open for association calibration.

The extraction-only calibration run corrected the misleading two-items-beside-one-image layout. It made two calls for `$0.044950`. The PDF then associated the image with the intended item at `0.98` and located the region at `0.99`, showing that the layout calibration worked. It rated usability `0.62`/`uncertain`, while the PNG returned `no_candidate`. Visual inspection shows the embedded dish is an abstract CSS illustration; the remaining failure is therefore fixture representativeness, not evidence that the reuse threshold should change.

## Consequences

- Cost is no longer the leading pipeline risk at the measured profile.
- Low quality is the default candidate, but launch evaluation must still test more cuisines and visual styles.
- Source-photo reuse needs prompt/schema calibration and more representative fixtures. Lowering the confidence threshold to make the current fixture pass is explicitly rejected.
- The next source-photo fixture must contain an internally created photorealistic dish image. Repeating the same abstract fixture would spend money without testing a new hypothesis.
- Current pricing is configuration stamped to this run and must be rechecked before later benchmarks.
