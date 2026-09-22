# Managed creator preview

The managed creator path is implemented and partially provisioned. Do not flip
`CREATOR_BACKEND=managed` until every development resource below exists and the
database migrations are applied.

Each numbered provisioning step is a separate external action and needs fresh
approval before it runs. Prefer Singapore-hosted resources where the vendor
offers a region choice. Never print, commit, or copy secret values into reports.

## Provisioning order

1. [x] Create the Clerk development application with email codes and Google sign-in.
2. [x] Create the Singapore Neon project and apply committed Drizzle migrations.
3. [x] Create separate private Vercel Blob stores for sources and results.
4. [x] Provision Transloadit signed uploads and normalization with one-day Assembly retention.
5. [x] Create the Singapore Upstash Redis database.
6. [x] Configure Resend's development sender.
7. Configure the Vercel protected-preview project and Vercel Workflow.
8. Add the existing OpenAI project key and project-side spend limit.

Clerk was provisioned on 2026-09-22 as the `MenuGen` development application.
Email verification codes are enabled for sign-up and sign-in, and Google uses
Clerk's shared development credentials. Its keys exist only in the ignored local
environment file; they are not recorded in documentation or Git.

Neon was provisioned on 2026-09-22 in AWS Singapore as `MenuGen Development`.
Drizzle applied all three committed migrations to the development database;
verification found 12 application tables plus the Drizzle migration journal.
The privileged connection string exists only in the ignored local environment
file.

Vercel Blob was provisioned on 2026-09-22 as two private Singapore (`sin1`)
stores: `menugen-source-assets-dev` and `menugen-result-assets-dev`. Both are
connected to the `menugen` project for Development and Preview only, using the
separate `SOURCE_BLOB_*` and `RESULT_BLOB_*` environment prefixes. Read/write
tokens exist only in Vercel's sensitive environment settings and the ignored
local environment file. Production is not connected. Remote upload, private
delivery, and deletion behavior still need protected-preview verification.

Transloadit was provisioned on 2026-09-22 as the `menugen-dev` workspace.
Signature authentication is required, automatic Assembly replay and stored
instructions are disabled, and Assembly status is retained for one day. The app
uses a short-lived, signed, source-controlled recipe rather than a mutable
dashboard Template; that recipe verifies MIME types and file sizes, scans for
malware, normalizes images and HEIC/HEIF to JPEG, renders up to ten PDF pages,
pins ImageMagick `v3.0.1`, and requests one-day status and result retention. Its
scoped credential is available only in the ignored local environment file and
Vercel's Development and Preview Secret variables. Production is untouched.
Transloadit's temporary result URLs are copied once into the private source Blob
store and, according to the provider's current retention documentation, are
automatically removed after 24 hours. A credential exchange passed without
printing secrets; real upload, malware, callback, and normalization behavior
still need protected-preview verification.

Upstash Redis was provisioned on 2026-09-22 as
`menugen-dev-rate-limits` on the free plan with Singapore (`sin1`) as its
primary region, no extra read regions, and eviction disabled. It is connected
to `menugen` for Development and Preview only; Production is untouched. Vercel
injects the standard `KV_REST_API_URL` and `KV_REST_API_TOKEN` names, while the
app also keeps the direct-Upstash names as a backward-compatible local option.
The resource reports available, a safe-mode `PING` returned `PONG`, and the
connection scope is verified. Live IP/device rate-limit behavior still needs
protected-preview verification.

Resend was configured on 2026-09-22 with a sending-only
`menugen-development` API key. The key is a Vercel Secret and
`RESEND_FROM_EMAIL=onboarding@resend.dev` is readable configuration; both are
limited to Development and Preview, with Production untouched. The direct
Resend setup is intentional for development because the current Vercel
Marketplace flow requires an owned domain, while this stage uses Resend's test
sender. One content-free delivery check to `delivered@resend.dev` was rejected
before send with sanitized reason `validation_error`; it was not retried, and
its disposable key was revoked. End-to-end completion delivery therefore stays
in the protected-preview acceptance matrix. Production also still needs a
verified sending domain.

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
