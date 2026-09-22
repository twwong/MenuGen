# MenuGen

MenuGen turns menu photos or PDFs into translated, mobile-friendly visual menus while preserving source text, prices, uncertainty, and image provenance.

Milestone 1 is complete. Milestone 2 is in progress. The deterministic creator proof covers the full private journey. The managed path is also wired for Clerk, Neon, private Blob stores, Transloadit, Vercel Workflow, Upstash, Resend, and OpenAI. Clerk, the Singapore Neon development database, separate private Singapore Blob stores, and the Transloadit development workspace are provisioned; the committed database schema is applied. The remaining managed services and protected preview are still pending. The creator workflow remains disabled in public production until that preview passes acceptance testing. See `prd.md` for the product requirements and `docs/implementation-plan.md` for delivery order.

## Local development

Requires Node.js 22 or 24 and pnpm 11.25 or newer. CI and Vercel currently use Node.js 22.

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>.

The creator route is dark by default. Run the deterministic local preview
without external services or paid calls with:

```bash
CREATOR_WORKFLOW_ENABLED=true CREATOR_BACKEND=fixture pnpm dev
```

The fixture backend stores synthetic draft state in a private temporary
directory so navigation and browser reloads work. It is never used when
`CREATOR_BACKEND=managed`. Its preview sign-in is deliberately local: it proves
the claim and quota boundaries without contacting Clerk or a paid image
provider.

The managed backend is intentionally not a one-variable switch. It needs the
approved development resources and secrets listed in `.env.example`, committed
Drizzle migrations applied to the selected Neon database, and the protected
preview checks in `docs/managed-preview.md`.

## Checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm benchmark
pnpm build
```

Generate a migration after changing the Drizzle schema, then apply committed
migrations to an explicitly selected development database:

```bash
pnpm db:generate
pnpm db:migrate
```

Both commands require `DATABASE_URL`. Never point local migration work at a
production database.

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
- `docs/managed-preview.md`: Provisioning order and protected-preview checks
- `docs/decisions/`: Architecture decision records
