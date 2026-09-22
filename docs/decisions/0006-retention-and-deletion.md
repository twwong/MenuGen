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
- Transloadit Assembly status and result expiry are requested at one day. Its temporary result URLs are copied once into application storage and are never served to users.

The workflow code now shares one idempotent deletion path across user deletion and scheduled expiry, deletes normalized sources after durable revisions and crops exist, and schedules the 24-hour backstop plus 90-day audit pruning. Separate private source and result stores were provisioned in Vercel's Singapore region on 2026-09-22. The Transloadit workspace uses one-day Assembly status retention, disables automatic replay and stored instructions, and the signed recipe requests one-day result expiry. The provider currently documents automatic deletion of temporary files after 24 hours. Store separation and credential access are verified; remote upload, delivery, and deletion evidence is still unverified.

## Consequences

Immediate cleanup is the normal path; the 24-hour workflow is insurance. Deletion must tolerate already-absent objects. Provider-side temporary retention needs verification during provisioning because application code cannot shorten a vendor copy after it has already expired or been removed.
