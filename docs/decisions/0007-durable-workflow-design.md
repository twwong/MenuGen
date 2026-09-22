# ADR 0007: Durable creator workflows

- Status: Accepted
- Date: 2026-09-22
- Source: `prd.md` sections 8.6, 12.2, and 12.5

## Context

Extraction, generation, cleanup, and expiration outlive browser requests. Work can be delivered more than once, individual images can fail independently, and external calls have different retry semantics.

## Decision

- Use Vercel Workflow functions only for deterministic orchestration. Database, storage, email, and provider calls run in step functions.
- Start workflows from Server Actions or narrow callback handlers and persist every run ID.
- Use database business keys and provider idempotency keys for side effects.
- Retry only timeouts, rate limits, and provider 5xx failures, with at most two retries and exponential backoff with jitter. Moderation, schema, and permanent 4xx failures are fatal.
- Fan out generation in groups of four. Each item reaches its own terminal state; a failed item becomes a placeholder and does not fail the menu.
- Reserve estimated spend before each provider call. Warn at `$1.50` and refuse new provider calls once conservative reservations would exceed `$2.00`.
- Poll creator status every two seconds while visible, back off while idle, and stop at terminal state.

The implementation compiles to seven workflows and nineteen steps. Paid image work uses a database claim before entering a provider step; ambiguous lost responses are treated as item failures instead of risking an automatic second paid call.

## Consequences

The database remains the product source of truth; Workflow is the durable executor. Steps may run more than once, so an apparently successful external side effect with a lost response must still be safe to replay. Paid smoke tests stay manual and require explicit approval.
