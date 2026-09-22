# Pipeline benchmark

Run the deterministic benchmark with:

```bash
pnpm benchmark
```

The command emits a JSON report containing checks, item counts, eligible-image counts, normalized provider-stage metadata, and a projected typical-menu cost. It deliberately excludes menu text, translations, prompts, filenames, and source references from the report format.

## Current synthetic case

`synthetic-ja-dinner-v1` contains three items:

- A prepared mackerel dish that receives an image prompt
- An ambiguous daily special that remains marked for review
- Packaged beer that remains image-free

The case checks exact item order, price text, expected translations, explicit source claims, uncertainty, image eligibility, forbidden prompt-injection fragments, and the $2 typical-menu ceiling.

The fixture provider also implements image-generation and moderation contracts, but the current pipeline stops after prompt construction. No images are generated and no external AI service is called.

## Cost warning

Current prices are fixture assumptions used to prove the accounting path. They are not claims about OpenAI pricing. The projection becomes evidence only after the production adapter records real model identifiers, usage, latency, and estimated cost.

## Adding cases

Benchmark inputs must be synthetic, internally created, or properly licensed and must not contain personal data. Each case should test one or more distinct risks rather than repeat the same happy path.
