# ADR 0005: Generation quota accounting

- Status: Accepted
- Date: 2026-09-22
- Source: `prd.md` sections 8.4 and 15

## Context

A signed-in user receives three menu-generation credits in a rolling 30-day window. Duplicate workflow delivery and concurrent confirmation must not consume more than one credit, and a run that never starts a generated-image provider request must not be charged.

## Decision

- Keep an append-only quota ledger with reservation, consumption, release, and audited adjustment entries.
- Give every side effect a unique business key. Insertions are idempotent under duplicate delivery.
- Serialize reservation checks per user in a database transaction.
- Reserve on explicit confirmation, consume immediately before the first generated-image provider request, and release only when no such request started.
- Active reservations reduce available credits. The rolling reset begins at consumption time.
- Source-photo-only menus and extraction failures create no consumption entry.

## Consequences

Quota state is reconstructable instead of being a mutable counter. The application can explain remaining credits and the next reset date. Reservations need cleanup and monitoring so abandoned runs do not suppress a credit forever.
