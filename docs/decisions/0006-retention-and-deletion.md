# ADR 0006: Retention and deletion

- Status: Accepted
- Date: 2026-09-22
- Source: `prd.md` sections 8.8 and 13

## Context

Original menu uploads are temporary processing inputs. Source-photo crops and generated images are result assets. Deletion must be idempotent, observable without retaining content, and safe when a user deletes early or a scheduled cleanup arrives twice.

## Decision

- Store application-controlled source objects separately from result assets.
- Copy normalized pages into the source store only long enough to persist validated structured data and all candidate crops, then delete them immediately.
- Schedule a per-draft 24-hour source-cleanup backstop at intake.
- Set result expiry 30 days after initial generation and schedule the same deletion path used by an early user request.
- Keep only content-free deletion tombstones for 90 days: opaque menu ID, asset class, reason, outcome, sanitized code, and timestamps.
- Transloadit temporary copies use one-day Assembly retention; they are not treated as application storage.

## Consequences

Immediate cleanup is the normal path; the 24-hour workflow is insurance. Deletion must tolerate already-absent objects. Provider-side temporary retention needs verification during provisioning because application code cannot shorten a vendor copy after it has already expired or been removed.
