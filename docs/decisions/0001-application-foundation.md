# ADR 0001: Application foundation

- Status: Accepted
- Date: 2026-09-22
- Source: `prd.md` sections 12, 16, and 18

## Context

MenuGen needs a mobile-first creator workflow, anonymous share pages, server-side APIs, durable processing, and managed infrastructure. The team should be able to validate AI quality and cost without first operating a distributed system.

## Decision

- Build the MVP as one Next.js App Router application using TypeScript.
- Use `pnpm` as the package manager.
- Deploy the application to Vercel.
- Use Neon Postgres for persistent relational data.
- Access AI capabilities through internal provider interfaces, with OpenAI as the first production adapter and deterministic fixtures for local development and tests.
- Keep business rules independent of Next.js, database clients, and provider SDK response shapes.
- Deliver the benchmark pipeline before the full creator workflow.

## Consequences

### Benefits

- One application keeps the MVP deployment and local workflow simple.
- Domain boundaries preserve the option to move workers or adapters later without prematurely creating services.
- Fixture adapters make quality, failure, and UI work repeatable without incurring provider cost.
- Pipeline-first delivery tests the product's hardest assumption early.

### Costs

- Background jobs will require an external durable orchestrator because Vercel requests cannot own long-running generation work.
- Care is needed to prevent framework and provider types from leaking into domain logic.
- Vendor selection remains incomplete until short spikes validate operational requirements.

## Not decided here

- Auth provider
- Database library
- Object storage
- Job orchestrator
- Email, analytics, and monitoring vendors
- Production AI model versions

Those decisions require small evidence-producing spikes and separate ADRs.
