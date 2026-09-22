# MenuGen

MenuGen turns menu photos or PDFs into translated, mobile-friendly visual menus while preserving source text, prices, uncertainty, and image provenance.

The pipeline benchmark milestone is in progress. The deterministic schema-v2 manifest passes locally, and the OpenAI adapter has been measured against synthetic PNG and PDF sources. Cost and core extraction checks passed; source-photo auto-reuse still needs calibration. See `prd.md` for the product requirements and `docs/implementation-plan.md` for delivery order.

## Local development

Requires Node.js 22 or 24 and pnpm 11.25 or newer. CI and Vercel currently use Node.js 22.

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>.

## Checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm benchmark
pnpm build
```

`pnpm benchmark` runs the deterministic synthetic manifest and prints a content-free quality and cost report. Its pricing numbers remain fixture assumptions; the measured provider result is documented separately in `docs/benchmark.md`.

Regenerate the committed synthetic PNG/PDF sources with:

```bash
pnpm fixtures:live
```

The live benchmark is developer-only, never runs in CI, and requires `OPENAI_API_KEY`, explicit spend confirmation, intact fixture hashes, and a cap no greater than $2:

```bash
pnpm benchmark:live -- --confirm-spend --max-usd 2
```

It makes at most two extraction, two translation, and two image-generation calls without retries. Reports and generated images are written under ignored `artifacts/benchmark-live/` directories. The application guard refuses calls outside its reservations; an OpenAI project spend limit is still the absolute billing backstop.

Run the browser baseline after installing Playwright browsers:

```bash
pnpm exec playwright install chromium webkit
pnpm test:e2e
```

## Documentation

- `prd.md`: Product requirements and non-negotiable behavior
- `AGENTS.md`: Repository guidance for coding agents
- `docs/implementation-plan.md`: Milestones and initial backlog
- `docs/benchmark.md`: Benchmark structure, guarantees, and limitations
- `docs/decisions/`: Architecture decision records
