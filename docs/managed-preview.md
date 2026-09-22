# Managed creator preview

The managed creator path is implemented but deliberately unprovisioned. Do not
flip `CREATOR_BACKEND=managed` until every development resource below exists and
the database migrations are applied.

Each numbered provisioning step is a separate external action and needs fresh
approval before it runs. Prefer Singapore-hosted resources where the vendor
offers a region choice. Never print, commit, or copy secret values into reports.

## Provisioning order

1. Create the Clerk development application with email codes and Google sign-in.
2. Create the Singapore Neon project and apply committed Drizzle migrations.
3. Create separate private Vercel Blob stores for sources and results.
4. Create the Transloadit template and callback credentials with one-day Assembly retention.
5. Create the Singapore Upstash Redis database.
6. Configure Resend's development sender.
7. Configure the Vercel protected-preview project and Vercel Workflow.
8. Add the existing OpenAI project key and project-side spend limit.

The environment key names are documented in `.env.example`. Validate presence,
not values. Keep `CREATOR_WORKFLOW_ENABLED=false` in public production.

## Protected-preview acceptance

Use synthetic inputs only. A passing run must prove:

- JPEG/PNG/HEIC and PDF normalization, signature spoof rejection, encrypted PDF rejection, page/byte limits, malware rejection, and callback-signature rejection.
- Blur/glare/perspective rejection before extraction, prompt-injection resistance, immutable corrections, and uncertain photo associations staying reviewable.
- Anonymous IP and device limits, one-time Clerk claim, ownership denial, safe DTOs, and private asset delivery without Blob-key exposure.
- One transactional credit consumption under concurrent confirmation and duplicate delivery; no charge for source-photo-only or pre-provider failure.
- Groups of four, transient-only retry, permanent item placeholders, two regenerations, and the `$2.00` reservation ceiling.
- Leave/return polling, one content-free completion email, immediate source cleanup, the 24-hour backstop, 30-day result expiry, user deletion, and content-free audit pruning.
- Mobile Chrome and Safari keyboard/focus behavior, reduced motion, and WCAG 2.2 AA checks.

Paid OpenAI smoke calls need their own explicit approval immediately before
execution. A provider-side spend limit is the billing backstop; the application
ceiling only prevents knowingly starting an over-budget call.

Milestone 2 stays open until this matrix passes against the provisioned preview.
