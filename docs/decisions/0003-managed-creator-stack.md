# ADR 0003: Managed creator stack

- Status: Accepted for development
- Date: 2026-09-22
- Source: `prd.md` sections 8, 12, 13, and 15

## Context

Milestone 2 needs private uploads, durable processing, authentication, rate limits, transactional email, and a database without turning the MVP into an infrastructure project. The services must support Singapore-hosted resources where the vendor offers them, and the public production workflow must stay dark until a protected preview passes.

## Decision

- Clerk provides email-code and Google authentication.
- Neon Postgres plus Drizzle stores creator state and immutable menu revisions.
- Separate private Vercel Blob stores hold temporary sources and 30-day result assets.
- Transloadit verifies server-detected file types, scans malware, normalizes HEIC/HEIF, and renders PDF pages.
- Vercel Workflow runs extraction, item generation, cleanup, and expiration.
- Upstash enforces sliding-window anonymous limits for both IP and opaque device token.
- Resend sends one content-free completion email through a database outbox.
- Existing OpenAI adapters remain behind internal AI provider contracts.

All adapters are feature-gated. No account or remote resource is created by committing this decision; provisioning needs explicit approval for each external action.

The local implementation now has concrete adapters and workflow entry points for every selected service. This does not validate vendor configuration or regional placement; those remain protected-preview checks.

## Consequences

The stack minimizes bespoke operations and keeps vendor types outside domain code. It also creates a real integration surface: signed Transloadit callbacks, private Blob delivery, Clerk claim races, Neon transactions, Workflow retries, and Resend idempotency must all pass protected-preview tests before the flag can be enabled publicly.
