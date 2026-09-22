# MenuGen Implementation Plan

**Current status:** Milestone 1 is complete. Milestone 2 is in progress. The deterministic creator proof runs from ordered upload through review, one-time anonymous claim, quota reservation/consumption, source-photo reuse, independent item generation, visible partial failure, uploader regeneration, a resumable dashboard, a private result, one-time completion, and idempotent deletion/expiry. The managed path now implements the same journey across Clerk, Neon, private Blob stores, Transloadit, Vercel Workflow, Upstash, Resend, and OpenAI. Clerk, the Singapore Neon development database, separate private Singapore Blob stores, and the Transloadit development workspace are provisioned; all committed migrations are applied. Remaining service provisioning, protected-preview integration tests, and manually approved live smoke tests remain open.

## Goal

Ship the public MVP defined in `prd.md` without hiding uncertainty, inventing safety claims, or allowing expensive AI work to become operationally unbounded.

The delivery order follows the largest product risk: prove that menus can be extracted, translated, classified, and visualized at acceptable quality and cost before building the entire workflow around the pipeline.

## Delivery principles

- Build a thin end-to-end slice before broad feature coverage.
- Treat source facts and generated estimates as different data classes.
- Store confidence and provenance from the first schema version.
- Make every costly or asynchronous operation idempotent.
- Add deletion, cost, and failure telemetry with the feature that creates the data.
- Keep vendor-specific responses behind internal adapters.
- Test failure and ambiguity paths alongside the happy path.

## Technical foundation

The PRD already selects:

- Next.js App Router with TypeScript
- Vercel hosting
- Neon Postgres
- OpenAI-first provider adapters
- Managed infrastructure with low operational overhead

Initial implementation choices:

- Use `pnpm` for package management.
- Keep one deployable Next.js application for the MVP.
- Organize application code by domain rather than by vendor.
- Use runtime schemas at every AI and external-service boundary.
- Keep the core menu model usable without a live AI provider so fixtures and benchmark cases can drive development.

The selected auth, storage, job, and email vendors remain feature-gated until short spikes confirm deletion behavior, time limits, cost, data handling, and local development experience. Analytics and monitoring remain open choices.

## Milestone 0: Repository foundation

**Status:** Complete (2026-09-22)

### Deliverables

- Next.js and TypeScript application scaffold
- Package scripts for development, build, lint, type-check, format, and tests
- Unit-test runner and browser-test baseline
- Environment-variable schema and redacted example file
- Continuous-integration checks
- Initial domain folders and architecture documentation
- Vercel project linkage before database or development commands run

### Exit criteria

- A clean checkout can be installed using documented commands.
- Formatting, linting, type checks, unit tests, and production build pass.
- No secret is committed or printed by validation tooling.
- `AGENTS.md` contains the real commands and repository layout.

## Milestone 1: Pipeline benchmark

**Status:** Complete (2026-09-22)

### Deliverables

- Versioned schemas for menu extraction, translation, confidence, provenance, and item eligibility
- Provider interfaces for extraction, translation, image generation, and moderation
- OpenAI adapter behind those interfaces
- Fixture adapter for deterministic local and test runs
- Licensed or internally created benchmark manifest
- Command-line benchmark runner that records quality, latency, token/image usage, and estimated cost
- Difficult-input and prompt-injection test cases
- Initial confidence and rejection thresholds

### Thin vertical slice

One representative menu fixture should flow through:

1. Input metadata validation
2. Structured extraction
3. Translation
4. Eligibility classification
5. Human-readable review output
6. Image prompt construction
7. Cost and latency report

The first slice may use fixture files instead of uploads, authentication, persistence, or background jobs. Its purpose is to validate the expensive intelligence layer quickly.

### Exit criteria

- Schema-invalid provider output is rejected safely.
- Original text, price text, order, and explicit claims survive the pipeline.
- Uncertain fields remain marked.
- Confident source photos suppress generation; uncertain associations remain reviewable and are never reused automatically.
- Unstated allergens and dietary claims never appear.
- A representative 40-item projection remains below the $2 target or produces a clear remediation decision.

## Milestone 2: Creator workflow

**Status:** In progress (foundation implemented; approved development provisioning underway)

### Deliverables

- Signed uploads and server-side file validation
- Upload scanning and difficult-input preflight
- Temporary-source lifecycle and deletion audit evidence
- Extraction and translation persistence
- Exception-only review and correction UI
- Authentication before generation
- Append-only quota ledger with atomic reservation and consumption
- Durable item-level generation workflow
- Progressive creator status
- Completion email and resumable dashboard

### Exit criteria

- A user can upload, review, authenticate, generate, leave, and return.
- Duplicate delivery cannot double-consume quota or duplicate generation attempts.
- One item failure cannot fail the menu.
- Original sources are deleted within the required deadline.

### Vertical slices

- [x] Foundation: domain schemas, state rules, Drizzle schema/migrations, safe DAL contracts, provider interfaces, and managed-stack ADRs.
- [ ] Upload and review: local code now covers signed Transloadit intake, callback verification, strict normalized-file validation, moderation, preflight, extraction, immutable revision persistence, crop-before-delete ordering, and the review UI. The Transloadit workspace, scoped credential, signature enforcement, and one-day retention are provisioned. Real file processing, callback delivery, and remote source deletion still need protected-preview verification.
- [ ] Authentication and generation: local code now covers Clerk-backed atomic claiming, a transactional Neon quota ledger, source-only completion, grouped Vercel Workflow fan-out, bounded retries, item isolation, cost ceilings, private result assets, and two uploader regenerations. Concurrency and provider-failure behavior still need provisioned integration tests.
- [ ] Resume and lifecycle: local code now covers safe polling DTOs, private asset streaming, the dashboard, database-backed Resend idempotency, immediate deletion, 24-hour source cleanup, 30-day expiration, and 90-day audit pruning. Scheduled execution, email delivery, and remote asset deletion still need protected-preview verification.
- [ ] Closure: protected-preview acceptance, manual live smoke tests, final documentation, and milestone sign-off.

## Milestone 3: Publication and operations

### Deliverables

- Immutable menu revisions with atomic publication
- Stable opaque share links stored as hashes where practical
- Anonymous, bilingual viewer with search and section navigation
- Image provenance labels and persistent disclaimer
- `noindex` and restrictive referrer policy
- Expiration, early deletion, and neutral expired states
- Reporting and takedown workflow
- Audited admin console
- Minimal allowlisted analytics and usefulness survey

### Exit criteria

- Viewers see one complete revision, never a partial update.
- Unlisted tokens do not appear in analytics, logs, referrers, or email tracking.
- Expiration and deletion remove content and assets end to end.
- Operators can diagnose jobs and costs without casually browsing menu content.

## Milestone 4: Evaluation and launch

### Deliverables

- Versioned launch benchmark across supported languages and input types
- Automated and manual accessibility checks
- Mobile and desktop browser matrix
- Load, retry, provider-outage, abuse, takedown, and deletion drills
- Blind diner evaluation
- Cost and quality dashboards using content-free telemetry

### Exit criteria

Every launch gate in PRD section 11.3 passes, including the task-success threshold, zero unresolved critical benchmark mistranslations, WCAG 2.2 AA, lifecycle verification, and the typical-menu cost ceiling.

## Initial domain boundaries

```text
src/
  app/              Next.js routes, layouts, and route handlers
  features/         User-facing workflows grouped by capability
  domain/           Menu, revision, quota, job, asset, and report rules
  providers/        Thin external-service adapters
  infrastructure/   Database, storage, jobs, email, and telemetry plumbing
  shared/           Small cross-domain utilities and UI primitives
tests/
  fixtures/         Synthetic or properly licensed menu cases
  benchmark/        Quality and cost evaluation harness
  e2e/              Browser-level acceptance tests
docs/
  decisions/        Short architecture decision records
```

Dependencies should point inward: routes and infrastructure may call domain logic; domain logic must not import Next.js, database clients, or provider SDK response types.

## Decisions requiring spikes

Record each accepted choice in `docs/decisions/`.

1. Auth provider
2. Object storage and upload scanning
3. Durable job orchestrator
4. Database library and migration workflow
5. Transactional email provider
6. Analytics and error monitoring
7. Extraction and translation call structure
8. Progress transport: server-sent events, managed pub/sub, or bounded polling
9. Image dimensions, format, concurrency, and optimization settings
10. Lifecycle deletion mechanics and audit evidence

## First working backlog

- [x] Link the Vercel project and verify the local environment.
- [x] Scaffold the Next.js application with TypeScript and `pnpm`.
- [x] Add formatting, tests, environment validation, and CI.
- [x] Define the first versioned menu-extraction schema.
- [x] Implement fixture-backed provider interfaces.
- [x] Add one synthetic bilingual menu benchmark case.
- [x] Build the benchmark runner and cost-report format.
- [x] Add the OpenAI adapter only after the deterministic pipeline passes locally.
- [x] Add difficult-input and prompt-injection coverage to a versioned manifest.
- [x] Define provisional confidence and rejection thresholds.
- [x] Measure the OpenAI adapter against representative synthetic PNG and PDF files.
- [x] Calibrate source-photo association until representative files clear the `0.85` automatic-reuse threshold without weakening uncertainty handling.

The fixture-v3 extraction-only run passed both PNG and PDF cases for `$0.041302`. It preserved item order and price text, exposed the ambiguous price, ignored prompt-injection text, reused the confidently associated source photo, and kept the text-only item generation-eligible. Minimum photo confidence was `0.99` region, `0.98` association, and `0.94` usability; no photo review flags were set. The `0.85` threshold was not lowered.

## Explicitly deferred

- Public-production enablement before the protected preview passes
- Full design system before the first pipeline proof
- Admin console before operational data exists
- Multi-provider failover
- Payments, ordering, reservations, public discovery, and native applications
