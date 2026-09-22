# ADR 0004: Creator persistence model

- Status: Accepted
- Date: 2026-09-22
- Source: `prd.md` sections 8.2, 12.4, and 13

## Context

Model output, user corrections, asynchronous item work, ownership, and quota accounting have different consistency needs. Updating one large mutable menu document would make concurrent jobs and correction provenance hard to reason about.

## Decision

- Store each validated `MenuDraftV1` as immutable JSONB. It wraps, rather than changes, schema-v2 extraction output.
- Every correction creates a new numbered revision pointing to the previous revision.
- Keep menu, item, job, asset, generation-attempt, quota, usage, email, and deletion state relational so changes can be checked and committed atomically.
- Use externally visible UUIDs. Keep Blob URLs/keys, provider references, token hashes, prompt hashes, and raw errors server-only.
- Enforce creator ownership in the data access layer and return allowlisted safe DTOs.
- A menu has exactly one owner: either an anonymous token hash or a user, never both.

The committed Drizzle migrations implement these boundaries. Managed repository writes use database transactions for claim, revision, quota, attempt, outbox, and deletion state changes; no migration has been applied to a remote database yet.

## Consequences

Jobs can pin a revision while later corrections remain a separate immutable record. Relational rows make item progress and idempotency keys queryable without duplicating full menu content. JSON revisions require runtime schema validation on every read and write; database shape alone is not enough.
