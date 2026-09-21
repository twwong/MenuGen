# MenuGen Product Requirements Document

| Field             | Value                      |
| ----------------- | -------------------------- |
| Status            | Product specification v1.0 |
| Date              | 2026-09-21                 |
| Release           | Public MVP                 |
| Primary platform  | Mobile web                 |
| Working directory | `/Users/wwong/git/MenuGen` |

## 1. Executive Summary

MenuGen helps diners understand unfamiliar, text-only restaurant menus and decide what to order. A diner uploads menu photos or a PDF. MenuGen extracts the menu structure, translates it into a selected language, reuses any usable source dish photos, and generates realistic visual estimates for text-only prepared food and drinks. The diner reviews uncertain extraction, watches generation progress, and publishes a mobile-friendly visual menu at an unlisted link.

The public MVP prioritizes output quality, source fidelity, and honest uncertainty over speed or feature breadth. Generated images are estimates, not claims about a restaurant's actual plating. Every generated image must be labeled `AI visual estimate`. MenuGen must preserve original text, prices, item order, and section structure; flag low-confidence fields; and never infer allergens, dietary suitability, nutrition, or other safety claims that the source menu does not state.

## 2. Problem and Opportunity

### 2.1 Problem

Diners often encounter menus that:

- Contain only text and provide no visual sense of unfamiliar dishes.
- Are written in a language the diner cannot read confidently.
- Use regional dish names that a literal translation does not make intuitive.
- Are difficult to scan and compare on a phone while seated at a restaurant.

Existing translation tools translate fragments but do not preserve a menu's hierarchy or help a diner visualize dishes. Generic image search is slow, inconsistent, and may show an unrelated version of a dish.

### 2.2 Product Opportunity

MenuGen can turn a static menu into an understandable, bilingual, visual browsing experience while preserving enough source context for the diner to verify what the restaurant actually wrote.

### 2.3 Core Job to Be Done

> When I am looking at an unfamiliar or foreign-language restaurant menu, help me quickly understand what each prepared item probably looks like so I can confidently choose what to order.

## 3. Users and Context

### 3.1 Primary User

The primary user is a diner who cannot decide what to order because a menu is unfamiliar, text-only, or in another language. This user's needs take precedence over restaurant publishing, designer, or operator workflows.

### 3.2 Usage Context

- The user is commonly on a phone at a restaurant or while planning a visit.
- Capture conditions may include glare, perspective distortion, shadows, and multiple menu pages.
- The user values a useful result quickly but can tolerate several minutes for all images if translated content and progress appear incrementally.
- Other diners at the table may open the shared result without creating accounts.

### 3.3 Secondary Actors

- **Viewer:** Opens an unlisted visual menu link and browses without signing in.
- **Administrator:** Investigates failed jobs, costs, and reports; retries jobs; and disables disputed results.
- **Rights holder:** Reports an unauthorized or objectionable regenerated menu for prompt takedown.

## 4. Product Goals

### 4.1 MVP Goals

1. Accept a restaurant menu as one or more photos or as a PDF.
2. Preserve the menu's sections, item order, source text, descriptions, and prices.
3. Translate the menu into a supported target language while keeping source text visible.
4. Generate a realistic visual estimate for every eligible text-only prepared food or drink item.
5. Reuse usable source photos and distinguish them from generated estimates.
6. Let uploaders resolve low-confidence extraction and regenerate misleading individual images.
7. Publish a polished, mobile-first menu at a stable, unlisted link.
8. Keep typical 40-item processing cost below $2 while providing progressive results.
9. Meet WCAG 2.2 AA and work primarily in current iOS Safari and Android Chrome.
10. Measure whether the result actually helped a diner choose an order.

### 4.2 North-Star Outcome

The strongest success signal is a diner reporting that the generated visual menu helped them choose what to order. Generation volume, shares, and image acceptance are supporting metrics, not substitutes for this outcome.

### 4.3 Explicit Non-goal

- Restaurant ordering, reservations, point-of-sale integration, checkout, and payments are not part of the MVP.

### 4.4 Deferred MVP Capabilities

These are not architectural prohibitions, but they are not required for the public MVP:

- Native mobile applications or offline processing.
- Publicly indexed menus or a searchable restaurant catalog.
- Downloadable PDF or bulk image-gallery export.
- Restaurant-owned publishing accounts and restaurant analytics.
- Personalized dish ranking or taste profiles.
- Nutrition calculation or inferred allergen and dietary classifications.
- Human-assisted or manual transcription of unreadable menus.
- Billing, subscriptions, or paid generation credits.
- Exact recreation of the source menu's typography and page design.

## 5. Product Principles

1. **Preserve records; label estimates.** Source text, stated ingredients, prices, and source-provided images are records of what appeared on the menu. Generated imagery and culinary interpretation are estimates and must be identified as such. A source-provided image must not be described as verified restaurant plating.
2. **Never hide uncertainty.** Low-confidence extraction or translation must be flagged and paired with the original text rather than silently completed.
3. **Progress before perfection.** Translation and completed images should appear incrementally in the creator workspace; one failed image must not invalidate a menu.
4. **Mobile table use first.** Browsing must be legible, one-handed, fast to scan, and resilient to a long menu.
5. **Correct exceptions, not everything.** The uploader should focus on uncertain fields rather than approve every extracted item.
6. **Bound cost explicitly.** Menu size, account quota, retries, and provider costs are product constraints.
7. **Minimize retained source data.** Original uploads are temporary processing inputs, not a permanent user library.

## 6. Launch Scope and Constraints

### 6.1 Supported Inputs

- One PDF, including text-based and scanned PDFs.
- One or more ordered photos in JPEG, PNG, HEIC, or HEIF format.
- Maximum 10 pages and 100 parsed menu items per menu.
- Proposed technical limit: 20 MB per file and 50 MB total per menu. These values may be tuned after provider testing without changing product scope.

The preflight process must detect unsupported formats, excessive page or item counts, unreadable resolution, severe blur, severe perspective distortion, and highly decorative or handwritten layouts that cannot be extracted reliably. Clearly unsuitable input must be rejected with specific recapture guidance rather than processed on a best-effort basis.

### 6.2 Languages

- Source-language detection may use the broader set supported by the selected AI provider.
- Guaranteed, evaluated target languages at launch:
  - English
  - Spanish
  - French
  - Japanese
  - Simplified Chinese
- The user selects the target language before extraction.
- The interface must support the script, line breaking, font fallback, pluralization, and date formatting needed by these target languages.

### 6.3 Image Eligibility

- Generate imagery for prepared food and prepared drinks.
- Keep packaged drinks, bottles, simple commodities, section headings, modifiers, and non-item text image-free.
- Reuse a usable source photo when it can be associated confidently with one menu item.
- Generate only when an eligible item lacks a usable source photo.
- If association between an existing photo and item is uncertain, flag it for review rather than guess.

## 7. End-to-End User Experience

### 7.1 Primary Flow

1. The diner opens MenuGen on mobile and selects a target language.
2. The diner captures menu pages or uploads photos/PDF.
3. MenuGen validates file type, size, page count, legibility, and likely extractability.
4. MenuGen extracts and translates the menu into structured sections and items.
5. The diner sees an exception-only review. Low-confidence fields are prominent; high-confidence content can be inspected but does not require confirmation.
6. The diner corrects item grouping, source text, translation, descriptions, or prices as needed.
7. MenuGen asks the diner to sign in before costly image generation begins.
8. On confirmation, MenuGen consumes one menu credit and generates all eligible missing images.
9. The creator workspace displays item-level progress and completed results incrementally. The user may leave safely.
10. MenuGen sends one completion email and makes the result available in the account dashboard.
11. The diner reviews the result, hides an image, or regenerates an individual image with written guidance.
12. The diner publishes and shares a stable, unlisted web link.
13. Viewers browse by section, search text, compare target and source language, and answer an optional one-tap `Did this help you choose?` question.

### 7.2 Creator Information Architecture

- **Upload:** Target-language selector, camera/file controls, page ordering, capture guidance, and limits.
- **Processing:** Clear stages for validating, reading, translating, and preparing review.
- **Review:** Menu preview with a compact issue list and direct navigation to uncertain fields.
- **Generate:** Item-level statuses, progressive images, estimated remaining work, retry state, and safe navigation away.
- **Publish:** Final preview, incomplete-item summary, 30-day expiration notice, and copy/share controls.
- **Dashboard:** Active jobs, ready menus, expiration dates, remaining quota, report state, and delete controls.

### 7.3 Viewer Information Architecture

- Restaurant/menu title when extractable, without claiming official affiliation.
- Persistent target-language context and source-language disclosure.
- Sticky section navigation and text search.
- Compact visual cards in source-menu order.
- Target-language item name and description prominently displayed.
- Smaller original text immediately beneath the translation.
- Original price and currency exactly as stated; no currency conversion in MVP.
- `AI visual estimate` badge on every generated image.
- `Source menu image` provenance on reused images, without claiming that the restaurant verified the image.
- Placeholder for an unavailable image without removing the menu item.
- Persistent disclaimer that images may not match the restaurant's actual presentation and diners must confirm safety information with restaurant staff.
- Accessible report link and one-tap usefulness survey.

### 7.4 Visual Direction

The visual language is an editorial food guide rather than an AI dashboard:

- Warm, food-oriented typography with highly readable body text.
- Restrained colors that do not compete with dish imagery.
- Large, consistent imagery with dense but calm navigation.
- Realistic plated-photo generation with natural restaurant lighting and plausible presentation.
- Consistent image treatment within one menu, without imitating a venue-specific room, plate, logo, or exact presentation.
- Motion is optional and must respect reduced-motion preferences.

## 8. Functional Requirements

### FR-1: Upload and Preflight

1. A user can upload a supported PDF or multiple supported image files and reorder photo pages.
2. The client provides camera-specific guidance for framing, glare, overlap, focus, and complete page coverage.
3. The server validates file signatures rather than trusting filename extensions or client MIME types.
4. The system rejects encrypted PDFs, unsupported files, limit violations, and clearly unreadable inputs with an actionable reason.
5. The system must not begin paid image generation during upload or extraction.
6. Anonymous extraction must be rate-limited to control abuse even though it does not consume a menu credit.

### FR-2: Extraction and Translation

1. The system extracts, where present:
   - Menu or restaurant title
   - Source language by field or item when mixed
   - Sections and their order
   - Item names and order
   - Item descriptions
   - Prices and currency symbols/codes
   - Explicitly stated ingredients, allergens, and dietary labels
   - Source-photo regions and likely item association
2. Every extracted field stores source text, translated text where applicable, and confidence metadata.
3. The system preserves source spelling and price text even if they appear unusual.
4. Translation may clarify a regional dish name, but the UI must keep the original text visible and must not present inferred details as source facts.
5. The system must not infer or assert unstated allergens, dietary suitability, nutrition, ingredients, preparation safety, or cross-contamination information.
6. The extraction response must conform to a versioned schema and reject unstructured model output.
7. Menu content must be treated as untrusted input and cannot override system instructions or tool permissions.

### FR-3: Confidence and Review

1. Confidence is evaluated at field level, not only at page level.
2. Low-confidence item names, descriptions, prices, translations, item-photo associations, and section boundaries are flagged.
3. The review opens with an issue summary and navigates directly to each flagged field.
4. The uploader can edit source and translated text, price, item order, section assignment, and image eligibility.
5. The uploader can inspect all extracted content without being required to confirm high-confidence fields.
6. A critical unresolved field must remain visibly marked in the creator and viewer experiences; the system must never silently invent a replacement.

### FR-4: Authentication and Quota

1. Upload, preflight, extraction, translation, and review may occur before sign-in.
2. Sign-in is required immediately before image generation.
3. Each account receives three menu-generation credits per rolling 30-day period.
4. One credit is consumed atomically when the first item image-generation request begins.
5. Extraction failures do not consume a credit.
6. If a system failure occurs before any item-generation request is accepted, the credit reservation is released automatically.
7. The interface shows remaining credits before generation begins.
8. Exhausted users see the reset date and may register upgrade interest; the MVP does not take payment.
9. Quota checks and deductions occur server-side and are safe under retries and concurrent requests.

### FR-5: Image Selection and Generation

1. The system classifies entries and generates for all eligible prepared food and drinks by default.
2. A usable, confidently associated source photo is cropped and reused instead of generating a replacement.
3. Extracted source-photo crops are retained as result assets and follow the 30-day result retention policy even though the original upload is deleted.
4. Generated prompts use source menu facts, translated culinary context, and menu-level cuisine context where reliable.
5. Generated images are a best visual estimate and must not claim to represent the restaurant's actual serving.
6. Generated images follow a realistic plated-photo style consistently within a menu.
7. The system records provider, model, prompt-template version, generation status, and moderation result without exposing hidden prompts to viewers.
8. Each generated image is labeled `AI visual estimate` everywhere it appears.
9. The uploader can hide a misleading image or regenerate one item with written correction guidance.
10. Regeneration does not consume another menu credit, but must have a configurable per-item limit. The initial recommendation is two uploader-requested retries per item.
11. Generated and uploaded content must pass provider and application moderation before publication.

### FR-6: Asynchronous Processing

1. Image generation runs in durable background jobs, not a browser-bound request.
2. Jobs are resumable, idempotent, and safe under duplicate delivery.
3. The creator sees menu-level and item-level states without manually refreshing.
4. Completed translations and images appear progressively in the creator workspace.
5. The user can close the page and resume from the dashboard.
6. Transient provider failures use bounded exponential retries with jitter.
7. Permanent failures become visible placeholders with an explanation and an item retry where appropriate.
8. One failed item cannot fail the entire menu.
9. A completion email is sent once when all items reach a terminal state.

### FR-7: Publication and Sharing

1. The uploader can publish after all image jobs reach a terminal state, including menus with failed-image placeholders.
2. Publication creates an opaque, hard-to-guess URL that does not expose sequential database identifiers.
3. Share pages are available without authentication to anyone with the URL.
4. Share pages include `noindex` and must not be listed in a public catalog or sitemap.
5. Share responses use a restrictive referrer policy so the unlisted URL is not leaked to third-party destinations.
6. Published edits use the same stable URL.
7. Edits are staged and become visible atomically when the uploader republishes; viewers do not observe partially applied edits.
8. The uploader can unpublish or delete a result immediately.
9. Browser-native copy and share controls are the MVP export mechanism.

### FR-8: Result Lifecycle

1. Original uploaded files are deleted after extraction has produced durable structured data, and no later than 24 hours after upload.
2. Rejected and abandoned uploads are deleted as soon as practical and no later than 24 hours.
3. Structured menu data, translations, reused source-photo crops, and generated images expire 30 days after initial generation.
4. Dashboard and share views show the expiration date.
5. Expiration deletes result data and assets; links then show a neutral expired state without menu content.
6. The account owner may delete a result earlier.
7. Operational logs must not contain uploaded files, full menu text, generated images, access tokens, or model credentials.

### FR-9: Reports and Takedown

1. Every share page has a report link usable without an account.
2. Reports capture category, explanation, reporter contact when supplied, a server-resolved opaque result ID, and timestamp. The raw share URL or token is not stored in the report.
3. An administrator can disable a share link immediately while reviewing a report.
4. Confirmed takedowns delete public result content promptly.
5. Minimal audit metadata may be retained for 90 days after takedown: opaque result ID, report category, action, actor, and timestamps. It must not retain menu text or images.
6. Administrative actions are authenticated, authorized, and audited.

### FR-10: Admin Console

The launch admin console must support:

- Search by opaque menu/job/account/report identifier.
- Job status, stage timing, retry count, and sanitized provider error inspection.
- Per-menu and per-stage estimated provider cost.
- Safe retry of failed stages.
- Share-link disable and result deletion.
- Report review and resolution.
- Quota-ledger inspection and corrective adjustment with an audit reason.
- Audit history for every mutating admin action.

The console must not provide casual browsing of user menu content. Content access, when necessary for support or moderation, must be deliberate and logged.

### FR-11: Product Analytics and Feedback

1. Track only the minimum events needed for funnel, quality, cost, and outcome measurement.
2. Analytics payloads must not include menu text, translations, filenames, images, prompts, email addresses, or unlisted share tokens.
3. The viewer receives an optional one-tap usefulness question: `Did this help you choose what to order?`
4. A negative response may accept optional, predefined reasons and free-text feedback with a clear privacy warning.
5. Session replay is not included in the MVP.

Recommended events:

- `upload_started`
- `upload_rejected`
- `extraction_completed`
- `review_issue_shown`
- `review_correction_saved`
- `sign_in_completed`
- `generation_started`
- `item_generation_completed`
- `item_generation_failed`
- `item_regenerated`
- `menu_published`
- `share_opened`
- `search_used`
- `helped_choose_answered`
- `menu_deleted`
- `report_submitted`

## 9. State Models

### 9.1 Menu State

```text
draft
  -> validating
  -> rejected | extracting
  -> extraction_failed | review_ready
  -> awaiting_auth
  -> queued
  -> generating
  -> ready_with_warnings | ready
  -> published
  -> disabled | expired | deleted
```

Retries may move `extraction_failed` back to `extracting` and `ready_with_warnings` back to `generating` for selected items. Publication state should be stored separately from processing state if that makes transitions less ambiguous in implementation.

### 9.2 Item Image State

```text
not_eligible
source_photo_ready
queued
generating
moderating
ready
failed_retryable
failed_permanent
hidden
```

## 10. Non-functional Requirements

### 10.1 Performance Targets

These are MVP engineering targets to validate with production-like tests, not promises to users:

- Upload UI responds immediately and reports byte-level progress.
- A typical four-page menu reaches review within 60 seconds at p95, excluding unusually slow provider responses.
- The first generated images for a typical menu appear within 90 seconds of generation start at p95.
- A typical 40-item menu reaches terminal generation state within 10 minutes at p95.
- Share-page largest contentful paint is under 2.5 seconds at p75 on representative mobile networks after image optimization.
- Search and section navigation respond within 100 ms for a 100-item client-side dataset.

### 10.2 Reliability

- No job may depend on an open browser tab.
- Every external request must have a timeout and classified error handling.
- Job and quota operations must be idempotent.
- User-facing state must survive deployment and worker restart.
- Initial service objective: 99.5% monthly availability for upload, dashboard, and share-page routes, excluding upstream provider outages.

### 10.3 Accessibility

The application must meet WCAG 2.2 AA, including:

- Complete keyboard operation and visible focus.
- Semantic headings, landmarks, forms, errors, and status updates.
- Screen-reader announcements for processing-state changes that do not become disruptive.
- Text alternatives that identify dish name and whether imagery is generated or source-provided; alt text must not invent visual facts.
- Minimum contrast, target size, responsive zoom, text reflow, and reduced-motion support.
- No critical action dependent only on color, hover, drag, or image interpretation.
- Accessible alternatives to drag-based page reordering.

### 10.4 Security

- Use signed, short-lived direct-upload URLs where supported.
- Validate file signatures, dimensions, decompression behavior, and PDF safety server-side.
- Scan uploads using the chosen storage or security service before model processing.
- Encrypt data in transit and at rest.
- Keep provider keys server-side and use least-privilege environment separation.
- Apply per-account, per-IP, and per-device rate limits to upload, extraction, generation, regeneration, report, and share-token probing routes.
- Use CSRF protection where cookie authentication is used and secure cookie settings throughout.
- Treat extracted content as untrusted data and escape it in every rendered context.
- Prevent model output from invoking tools, selecting arbitrary URLs, or altering authorization decisions.
- Record security-sensitive actions without recording source content.

### 10.5 Privacy

- Collect only account identity, processing state, structured result data, quota records, minimal analytics, and operational metadata required by this PRD.
- Clearly disclose source-upload deletion, result retention, generated-image labeling, third-party AI processing, and unlisted-link behavior before generation.
- Provide account-level access to delete each result.
- Do not use customer uploads or results for model training without a separate, explicit opt-in.
- Do not expose share URLs in analytics, referrers, support logs, or email tracking parameters.

### 10.6 Cost

- Target total variable processing cost below $2 for a typical 40-item menu.
- Store estimated cost for each extraction, translation, image generation, and regeneration call.
- Alert administrators when per-menu estimated cost exceeds a configurable threshold.
- Image size, model choice, retries, and concurrency must be configurable without a schema migration.
- The system must stop gracefully at hard menu and regeneration limits rather than incur unbounded cost.

## 11. Quality and Launch Gates

### 11.1 Evaluation Set

Maintain a versioned benchmark containing representative:

- Source languages, including mixed-language menus.
- Target languages from the five-language launch set.
- Cuisines, regional dish names, and transliteration needs.
- Single- and multi-column layouts.
- Digital PDFs, scanned PDFs, and mobile photos.
- Menus with and without source photos.
- Prices, modifiers, explicit dietary labels, and ambiguous typography.
- Prepared dishes, prepared drinks, packaged drinks, and non-item text.

Benchmark source files must be licensed or internally created and must not contain personal data.

### 11.2 Critical Error Definition

A critical error is one that could materially change an order or mislead a diner, including:

- Wrong dish identity or section association.
- Added, omitted, or reversed negation in a stated ingredient or dietary claim.
- Incorrect stated allergen translation.
- Wrong price or currency association.
- Source photo attached to the wrong item.
- Generated image presented as a real restaurant photo.

### 11.3 Public-MVP Launch Gate

Before public launch:

1. At least 80% of representative test diners must complete the upload-to-publish task and report that the result helped them choose an order.
2. There must be zero unresolved critical mistranslations in the fixed launch benchmark.
3. Blind diner evaluation must confirm that generated imagery is generally recognizable and useful without exposing the generation prompt.
4. A typical 40-item benchmark menu must remain below the $2 variable-cost target.
5. WCAG 2.2 AA automated checks and manual keyboard/screen-reader checks must pass for the primary flow.
6. Current iOS Safari and Android Chrome must pass the primary-flow test matrix; current desktop Safari, Chrome, Firefox, and Edge must remain functional.
7. Source deletion, 30-day expiration, quota accounting, takedown, retry, and partial-failure behavior must be verified end to end.

### 11.4 Ongoing Quality Metrics

- Helped-choose positive response rate.
- Upload-to-review completion rate.
- Review-to-generation conversion rate.
- Publish completion rate.
- Field correction rate by field type, source language, and provider version.
- Critical and noncritical translation error rate on the benchmark.
- Generated-image hide and regeneration rates.
- Item generation failure and moderation rates.
- Median and p95 time to review, first image, and completion.
- Median and p95 cost per menu and per generated item.
- Share opens per published menu.
- Reports and confirmed takedowns per 1,000 published menus.

## 12. Reference Architecture

### 12.1 Selected Direction

- **Application:** Next.js with TypeScript, using the App Router.
- **Hosting:** Vercel.
- **Database:** Neon Postgres.
- **AI:** OpenAI-first for multimodal extraction, translation, and image generation, accessed through thin internal provider adapters.
- **Operational posture:** Low-operations managed services.

### 12.2 Recommended Supporting Services

The following are implementation recommendations, not locked product requirements:

- **Authentication:** Managed passwordless and OAuth provider such as Clerk, or an equivalent service with secure Next.js support.
- **Object storage:** Vercel Blob or an S3-compatible managed store with lifecycle deletion and signed uploads.
- **Durable jobs:** Trigger.dev, Inngest, or an equivalent service that supports long-running, resumable, idempotent fan-out jobs.
- **Email:** Resend or an equivalent transactional provider.
- **Analytics:** A privacy-conscious event product configured without session replay and with strict property allowlists.
- **Error monitoring:** A service such as Sentry with content scrubbing and source-map support.

Final service choices should be recorded in short architecture decision records after small spikes verify timeout behavior, data residency, deletion APIs, cost, and local developer experience.

### 12.3 Logical Components

```text
Mobile/Desktop Browser
        |
        v
Next.js Web Application and API
        |---- Managed Auth
        |---- Neon Postgres
        |---- Temporary/Result Object Storage
        |---- Durable Job Orchestrator
                         |
                         v
                 AI Provider Adapters
                   | extraction
                   | translation
                   | image generation
                   | moderation
        |---- Transactional Email
        |---- Minimal Analytics / Error Monitoring
```

### 12.4 Provider Adapter Boundaries

Use separate internal interfaces for:

- `extractMenu(input): StructuredMenuExtraction`
- `translateMenu(menu, targetLanguage): StructuredMenuTranslation`
- `generateDishImage(context): GeneratedImage`
- `moderateInput(input): ModerationDecision`
- `moderateImage(image): ModerationDecision`

Adapters must normalize errors, usage, model identifiers, latency, and estimated cost. Application code must not rely directly on one provider's response shape outside the adapter package. Multi-provider failover is not required at launch.

### 12.5 Processing Pipeline

1. Create an anonymous draft and issue signed upload instructions.
2. Validate and scan the upload.
3. Run input-quality classification.
4. Extract structured source content and source-photo candidates.
5. Translate into the selected target language.
6. Persist schema-validated structured data and confidence metadata.
7. Delete the original source within the retention deadline.
8. Present exception review and save corrections as explicit revisions.
9. Authenticate, reserve quota, and enqueue generation.
10. Classify item eligibility and fan out source-photo processing or image generation.
11. Moderate, optimize, and persist successful result assets.
12. Aggregate item states and send one terminal-state email.
13. Publish an immutable revision pointer behind a stable opaque share token.

## 13. Conceptual Data Model

Exact names may change, but implementation must preserve these concepts:

- **User:** Auth-provider ID, locale, role, created date.
- **Menu:** Owner, target language, source-language summary, processing state, publication state, expiration, timestamps.
- **Menu source:** Temporary object key, file metadata, page order, validation state, mandatory deletion timestamp.
- **Menu revision:** Immutable snapshot/version used for atomic publication.
- **Section:** Revision, source and translated title, order, confidence.
- **Item:** Section, source and translated name/description, price text, explicit source claims, eligibility, order, confidence, review state.
- **Asset:** Item, source-photo or generated provenance, object key, dimensions, moderation state, expiration.
- **Generation attempt:** Item, provider/model/template version, state, sanitized error, usage, estimated cost, guidance, timestamps.
- **Job:** Menu, stage, state, idempotency key, attempts, timing, sanitized error.
- **Quota ledger:** User, credit reservation/consumption/release, menu, effective date, reason.
- **Share link:** Menu, opaque token hash, active revision, state, created/disabled/expiration dates.
- **Report:** Share link, category, optional contact, explanation, state, timestamps.
- **Admin audit event:** Actor, action, target type and opaque ID, reason, timestamp.
- **Outcome response:** Menu/share identifier, yes/no outcome, optional categorized reason, timestamp.

Important constraints:

- Store hashes of share tokens, not raw tokens, where practical.
- A published link points to one complete revision at a time.
- Quota ledger entries are append-only.
- Asset and result expiration is queryable and enforced by both scheduled deletion and storage lifecycle policy.
- Source deletion is independently auditable without retaining source content.

## 14. Key Acceptance Criteria

### 14.1 Happy Path

- Given a legible four-page foreign-language menu with 40 prepared items, the user can upload, review flagged fields, sign in, generate all eligible images, and publish an unlisted bilingual menu.
- The published menu preserves section and item order, source text, descriptions, and exact price text.
- Every generated image is badged; every reused source photo has source provenance.
- A viewer can open the link without signing in, navigate sections, search, and read target and source text on a current mobile browser.

### 14.2 Ambiguity

- Given low-confidence OCR or translation, the questionable field is visibly flagged with source text and is not silently replaced by a guess.
- A user can correct the field before generation.
- Unresolved uncertainty remains visible if the user proceeds.

### 14.3 Safety Claims

- Given a dish with no stated allergen or dietary information, neither creator nor viewer UI displays inferred safety labels.
- Given an explicitly stated allergen, MenuGen translates and attributes the statement to the source while retaining original text and still advises confirmation with restaurant staff.

### 14.4 Partial Failure

- Given several permanent image failures, all successfully processed items remain usable and the failed items show placeholders.
- The menu can still be published after all jobs reach terminal states.
- Retrying one item does not rerun or invalidate other items.

### 14.5 Quota

- Extraction failure does not consume a credit.
- The first accepted image-generation request consumes exactly one credit despite job retries or duplicate deliveries.
- A fourth generation attempt in a rolling 30-day window is blocked before provider work and shows the reset date.

### 14.6 Lifecycle

- Original uploads are unavailable after the deletion deadline.
- Result data and assets are unavailable after 30 days and the share URL shows an expired state.
- Early user deletion immediately disables the share page and schedules all result content for deletion.

### 14.7 Published Updates

- A viewer sees either the old published revision or the new complete revision, never a mix.
- Republish keeps the original share URL.

### 14.8 Difficult Input

- A severely blurred, distorted, handwritten, or decorative menu that cannot meet the extraction threshold is rejected before image generation.
- The error explains how to capture or upload a better source.

## 15. Risks and Tradeoffs

| Risk                                    | Consequence                                                | Mitigation                                                                                                                            |
| --------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Plausible but inaccurate imagery        | Diners mistake an estimate for the restaurant's real dish  | Badge every generated image, retain source text, use page-level disclaimer, allow hide/regenerate, never claim venue-specific plating |
| OCR or translation error                | Wrong order, price, or safety interpretation               | Field confidence, exception review, original text, benchmark, critical-error launch gate                                              |
| Long and expensive full-menu generation | Abandonment or unsustainable free use                      | Progressive creator results, 100-item cap, three-credit quota, eligibility rules, cost telemetry, bounded retries                     |
| Provider lock-in                        | Cost or quality deterioration becomes difficult to address | Thin adapters, normalized usage/errors, versioned schemas and prompt templates                                                        |
| Serverless timeout mismatch             | Partial or lost jobs                                       | Durable external job orchestration and idempotent item fan-out                                                                        |
| Prompt injection in menu text           | Model behavior or data exposure is manipulated             | Treat menu content as data, schema validation, no arbitrary tools/URLs, least privilege                                               |
| Copyright or restaurant objection       | Takedown demand or reputational harm                       | Unlisted/noindex results, 30-day expiration, visible reporting, prompt admin takedown, minimal retained audit record                  |
| Anonymous extraction abuse              | Unexpected OCR/translation cost                            | File and page limits, IP/device rate limits, preflight rejection, sign-in before image generation                                     |
| Source deletion conflicts with support  | Difficult to debug an extraction complaint                 | Retain structured data and confidence only; use licensed benchmark cases for debugging; never extend user-source retention silently   |
| Reused source images outlive the upload | User may not expect cropped content retention              | Disclose that source-photo crops become 30-day result assets and provide immediate delete/unpublish controls                          |
| Translation breadth exceeds validation  | Poor experience in untested languages                      | Guarantee only five target languages and evaluate each before launch                                                                  |
| Unlisted links are forwarded            | Viewership exceeds uploader intent                         | Explain link behavior, use opaque tokens, noindex, allow immediate disable/delete, avoid referrer leakage                             |

## 16. Delivery Plan

### Phase 1: Pipeline Prototype

- Build a benchmark harness for extraction, translation, item classification, and image prompting.
- Validate OpenAI model quality, schema compliance, latency, and cost.
- Prove the under-$2 typical-menu target and source-photo association approach.
- Define confidence thresholds and difficult-input rejection criteria.

Exit: Representative menus produce structured, bilingual data and recognizable image estimates with measured cost.

### Phase 2: Creator Workflow

- Implement upload, preflight, extraction, review, auth, quota, durable jobs, progressive creator UI, and email.
- Implement deletion deadlines and operational telemetry from the start.

Exit: A user can complete the workflow reliably without publication.

### Phase 3: Sharing and Operations

- Implement revisioned publication, unlisted viewer, search/sections, provenance labels, expiry, reports, and admin console.
- Add minimal analytics and the helped-choose survey.

Exit: End-to-end public-MVP behavior passes functional, security, privacy, and lifecycle tests.

### Phase 4: Evaluation and Launch

- Run blind diner evaluation across representative languages and cuisines.
- Fix critical benchmark errors and complete accessibility/manual browser testing.
- Conduct load, retry, provider-outage, abuse, takedown, and deletion drills.

Exit: Every launch gate in Section 11.3 is satisfied.

## 17. Implementation Decisions to Validate

These do not require further product discovery but should be resolved with short technical spikes:

1. Exact auth, object-storage, job-orchestration, email, analytics, and monitoring vendors.
2. OpenAI model versions and whether extraction and translation should be one call or separate stages.
3. Confidence calibration and the threshold for rejecting a difficult input.
4. Image dimensions, format, quality, and concurrency that satisfy both visual and cost targets.
5. Storage lifecycle mechanics that guarantee deletion while preserving deletion audit evidence.
6. Whether real-time progress uses server-sent events, managed pub/sub, or bounded polling.

## 18. Interview Decision Record

This record preserves the requirement choices and the product implications derived from them.

| Area                   | Decision                                                                     | Product implication                                                                   |
| ---------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Core job               | Generate dish images from text menus and translate menus from photos or PDFs | Product combines structured menu understanding, translation, and visual generation    |
| Primary user           | Diners who cannot decide what to order                                       | Optimize for at-table mobile use, not restaurant administration                       |
| Costliest failure      | Low-quality output                                                           | Quality gates and correction flows take priority over feature breadth                 |
| First-session value    | Export a finished artifact                                                   | The result must become a complete shareable experience                                |
| Launch context         | Public MVP                                                                   | Requires auth, quotas, security, privacy, support, and operational readiness          |
| Image promise          | Best visual estimate                                                         | Images may infer likely appearance but cannot claim restaurant-specific fidelity      |
| Ambiguity              | Flag uncertainty and preserve source                                         | Original text and field confidence remain visible                                     |
| Generation scope       | Generate everything                                                          | Generate every eligible item within explicit cost and item limits                     |
| Export format          | Shareable web menu                                                           | Stable responsive link is the MVP artifact; PDF is deferred                           |
| Source fidelity        | Preserve structure                                                           | Keep sections, order, price, and original text in a consistent app layout             |
| Wait model             | Progressive results                                                          | Durable item-level background work and progressive creator UI are required            |
| Abuse control          | Account quota                                                                | Image generation requires authenticated server-side credits                           |
| Source retention       | Auto-delete sources                                                          | Uploads are temporary; structured results follow a separate lifecycle                 |
| Correction owner       | Uploader edits                                                               | Creator workflow includes structured correction controls                              |
| Partial failure        | Publish with placeholders                                                    | Item failures cannot fail or remove the rest of a menu                                |
| Quality evaluation     | Blind diner evaluation                                                       | Launch quality must be validated with real diners, not only internal review           |
| AI portability         | Thin provider adapters                                                       | Keep application logic independent of provider response shapes                        |
| Application stack      | Next.js and TypeScript                                                       | Use one full-stack web codebase for the MVP                                           |
| Cloud posture          | Low-operations managed cloud                                                 | Prefer managed auth, storage, jobs, email, and observability                          |
| Translation breadth    | Curated launch languages                                                     | Guarantee only languages the team can evaluate                                        |
| Target languages       | English, Spanish, French, Japanese, Simplified Chinese                       | Build and test localization for these five targets                                    |
| Input boundary         | 10 pages or 100 items                                                        | Reject larger menus rather than incur open-ended cost                                 |
| Free quota             | Three menus per month                                                        | Use a rolling 30-day account allowance                                                |
| Sign-in point          | Before generation                                                            | Permit low-friction preview but authenticate before costly work                       |
| Default visibility     | Unlisted link                                                                | Use opaque tokens, noindex, and anonymous viewer access                               |
| Review depth           | Exception-only                                                               | Focus user attention on low-confidence output                                         |
| Bilingual display      | Translation plus source                                                      | Target language is primary; source text appears directly beneath                      |
| Image correction       | Regenerate with guidance                                                     | Support item-level regeneration without rerunning the menu                            |
| Viewer navigation      | Section tabs and search                                                      | Long mobile menus need sticky categories and fast text filtering                      |
| Safety claims          | Never infer them                                                             | Translate only claims explicitly stated by the restaurant                             |
| AI provider            | OpenAI-first adapters                                                        | Use OpenAI initially without coupling core application code to it                     |
| Core infrastructure    | Vercel plus Neon                                                             | Host Next.js on Vercel and persistent relational state in Neon Postgres               |
| Result retention       | 30 days                                                                      | Automatically expire structured content, images, and share access                     |
| Completion return      | Email plus dashboard                                                         | Users can leave safely while generation continues                                     |
| Launch revenue         | No payments                                                                  | Enforce limits and collect upgrade interest without checkout                          |
| North-star outcome     | Menu used to choose                                                          | Ask viewers whether MenuGen affected their ordering decision                          |
| Launch threshold       | Task-success benchmark                                                       | Require at least 80% completion/helpfulness and no critical benchmark mistranslations |
| Cost ceiling           | Under $2 per typical 40-item menu                                            | Instrument every stage and configure model quality/cost tradeoffs                     |
| Accessibility          | WCAG 2.2 AA                                                                  | Accessibility is a launch criterion, not a later enhancement                          |
| Explicit non-goal      | Ordering and payments                                                        | No checkout, reservations, or POS integration                                         |
| Generated disclosure   | Badge every image                                                            | Provenance appears at item level, not only in terms or page copy                      |
| Credit timing          | First image generation                                                       | Extraction failures are free; quota consumption is atomic and idempotent              |
| Device priority        | Modern mobile web                                                            | Current iOS Safari and Android Chrome are primary acceptance targets                  |
| Rights-holder response | Prompt takedown                                                              | Add reporting, admin disablement, deletion, and minimal audit data                    |
| Visual direction       | Editorial food guide                                                         | Use warm, restrained, image-led design instead of dashboard styling                   |
| Generated image style  | Realistic plated photo                                                       | Keep menu-level consistency while avoiding venue-specific claims                      |
| Published edits        | Update stable link in place                                                  | Publish complete revisions atomically behind one URL                                  |
| Analytics              | Minimal events plus survey                                                   | Avoid content capture and measure the actual ordering outcome                         |
| Operations             | Small admin console                                                          | Support jobs, costs, reports, retries, disablement, and audited actions               |
| Image eligibility      | Prepared food and drinks                                                     | Do not waste generation on packaged products or non-item text                         |
| Existing photos        | Reuse photos found in the source menu                                        | Label them as source-provided, preserve provenance, and generate only missing visuals |
| Difficult inputs       | Detect and reject clearly                                                    | Do not offer unreliable best-effort or human transcription at launch                  |

## 19. Definition of Done for the Public MVP

The MVP is done when a representative diner can use a current mobile browser to upload a supported menu, correct flagged extraction, authenticate, generate all eligible imagery within quota, leave and return safely, publish a bilingual visual menu, share it, use it to choose an order, and delete it; while administrators can understand cost and failures, handle a takedown, and verify source and result deletion without exposing menu content in logs. All launch gates in Section 11.3 must pass.
