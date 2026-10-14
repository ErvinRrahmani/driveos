# Enrolment page, lead inbox and review requests — design

Status: draft for review. Source: `.context/reports/DriveOS premium features.md` §1 ("An online enrolment page turns social reach into enrolments"). Builds on Phase 1 as committed on `main`.

## 1. Goal

Each school gets a public web page (name, address, prices, instructors, reviews) with an enrolment form and a click-to-WhatsApp button. Enquiries land in a lead inbox in admin, convert to a student plus an invitation in one click, and are attributed in the growth report as leads → enrolments → revenue. After a student passes the practical test, DriveOS asks them for a review; approved reviews appear on the page.

Success means a school owner can publish the page from settings, share its link on Instagram, see leads arrive, convert them, and read in the monthly growth report how many enrolments and how much revenue the page brought.

## 2. Scope

In:
- Public school profile (slug, headline, description, contact, WhatsApp number, external review link, visibility of prices and instructors) edited by the owner.
- Public page at `/s/{slug}` in `apps/admin` (no login) backed by one public API read.
- Lead capture from the page with spam protection and consent for minors.
- Lead inbox in admin: list, status, notes, one-click conversion.
- In-app reviews after a passed practical test, moderated by the school, shown on the page.
- Growth report attribution (leads captured, converted, revenue of converted leads).
- Plan gating: publishing the page and capturing leads require the `enrolment_page` plan feature.

Out (follow-ups, not built now): school logo upload, server-side rendering for SEO, Albanian translations (strings go through i18n with `en` only), lead assignment to staff, WhatsApp inbound messages (that is the AI front desk), Instagram or Facebook lead-form imports.

## 3. Modules and ownership

| Module | Owns (new) | Why |
| --- | --- | --- |
| `platform` | `plans.features text[]` | Plan feature gate (`enrolment_page`), reusable by the next premium features |
| `school` | `school_public_profiles`, `school_reviews` | The page and reviews describe the school |
| `training` | `leads` | Leads become students; conversion stays inside the students' module |
| `billing` | `price_items.show_on_public_page` | Which prices the page shows |
| `reporting` | new columns on `rm_school_metrics_daily`, `rm_lead_students` | Funnel attribution |
| `messaging` | templates `lead_captured`, `review_request` | Notifications |

No module reads another module's tables. The public read composes bus queries (§5).

## 4. Data model

All new tenant tables have `school_id uuid not null` with forced RLS and the standard `<table>_tenant` policy. Ids are UUIDv7. Times are `timestamptz`.

### 4.1 `plans.features text[] not null default '{}'` (platform)

Values are feature slugs. This design uses `enrolment_page`. `GET/POST/PATCH /v1/platform/plans` gain the field.

### 4.2 `school_public_profiles` (school)

| Column | Type | Notes |
| --- | --- | --- |
| `school_id` | uuid PK, FK schools | one profile per school |
| `slug` | text not null | globally unique (`school_public_profiles_slug_key`), 3–40 chars, `^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`, reserved words rejected (`admin`, `api`, `login`, `s`, `docs`, `platform`) |
| `published` | boolean not null default false | |
| `headline` | text | ≤ 120 chars |
| `description` | text | ≤ 2000 chars |
| `phone` | text | E.164 |
| `whatsapp_number` | text | E.164; the page's click-to-WhatsApp button uses `https://wa.me/<digits>` |
| `instagram_url`, `facebook_url` | text | https URLs |
| `external_review_url` | text | https URL, for example a Google Maps review link |
| `show_prices` | boolean not null default true | |
| `show_instructors` | boolean not null default true | |
| `version` | integer not null default 1 | |
| timestamps | | |

Slug uniqueness is global, so lookup by slug needs a `SECURITY DEFINER` function (SPEC §6.2): `school_id_for_public_slug(slug text) returns uuid`, which returns the school only when `published` and the school's `status = 'active'`. It is added to `FUNCTIONS` in `security-definer.test.ts`.

### 4.3 `school_reviews` (school)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `school_id` | uuid | |
| `student_id` | uuid FK students | one review per student (`school_reviews_student_key` unique) |
| `rating` | smallint not null | 1–5 (CHECK) |
| `text` | text | ≤ 600 chars |
| `display_name` | text not null | first name + initial, computed at submit time; never updated when the student is anonymized (the row is deleted then) |
| `status` | enum `pending | approved | hidden` | default pending |
| `submitted_at`, `moderated_at` | timestamptz | |
| `moderated_by_user_id` | uuid | |
| `version` | integer | |

Student anonymization (`DELETE /v1/students/{id}`) must remove the review: the school module subscribes to `StudentAnonymized` and deletes the row.

### 4.4 `leads` (training)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `school_id` | uuid | |
| `status` | enum `new | contacted | converted | lost` | default new |
| `source` | enum `page | manual` | `manual` for leads typed in by staff (phone call, walk-in) |
| `full_name` | text not null | ≤ 120 |
| `phone` | text | E.164; at least one of phone/email (CHECK) |
| `email` | text | lower-cased |
| `licence_class` | text not null | from the school's lesson types / price items; free text ≤ 10 |
| `message` | text | ≤ 1000 |
| `is_minor` | boolean not null | self-declared on the form |
| `guardian_name`, `guardian_contact` | text | required when `is_minor` (CHECK) |
| `consent_text_version` | text not null | the consent text shown on the form (i18n key version, e.g. `lead-consent.v1`) |
| `consented_at` | timestamptz not null | |
| `note` | text | staff notes, ≤ 2000 |
| `student_id` | uuid FK students | set on conversion |
| `converted_at`, `lost_at` | timestamptz | |
| `lost_reason` | text | ≤ 200 |
| `request_ip_hash` | text | sha256 of the submitting IP, kept 30 days for abuse review, then nulled by the purge job |
| `version` | integer | |
| timestamps | | |

Indexes: `(school_id, status, created_at desc)`, `(school_id, lower(email))`, `(school_id, phone)`.

### 4.5 `price_items.show_on_public_page boolean not null default false` (billing)

Only `active` items with the flag appear on the page.

### 4.6 Reporting

`rm_school_metrics_daily` gains `leads_captured`, `leads_converted`, `lead_revenue_minor` (all `not null default 0`). New read model `rm_lead_students(school_id, student_id PK, lead_id, converted_on date)` records which students came from leads so later payments can be attributed. The growth report (`growth_reports.payload` and the `GrowthReport` DTO) gains `leadsCaptured`, `leadsConverted`, `leadRevenueMinor`.

## 5. API

| Route | Auth | Permission | Handler |
| --- | --- | --- | --- |
| `GET /v1/public/schools/{slug}` | public, rate limit `public-page` (ip+route) | — | `GetPublicSchoolPageQuery` (school) |
| `POST /v1/public/schools/{slug}/leads` | public, rate limit `leads` (ip+route) | — | `CaptureLeadCommand` (training) |
| `GET/PUT /v1/school/public-profile` | bearer | `public_page.manage` | school |
| `GET /v1/leads?status=&cursor=&limit=` | bearer | `leads.read` | `ListLeadsQuery` |
| `GET /v1/leads/{id}` | bearer | `leads.read` | `GetLeadQuery` |
| `POST /v1/leads` | bearer | `leads.manage` | `CaptureLeadCommand` with `source: manual` |
| `PATCH /v1/leads/{id}` | bearer | `leads.manage` | `UpdateLeadCommand` (status contacted/lost, note, lost reason) |
| `POST /v1/leads/{id}/convert` | bearer, `Idempotency-Key` | `leads.manage` | `ConvertLeadCommand` |
| `POST /v1/reviews` | bearer | `reviews.submit` | `SubmitReviewCommand` (student, self) |
| `GET /v1/reviews?status=` | bearer | `reviews.moderate` | `ListReviewsQuery` |
| `PATCH /v1/reviews/{id}` | bearer | `reviews.moderate` | `ModerateReviewCommand` (approve/hide) |
| `GET /v1/me` | — | — | gains `features: string[]` of the active school's plan, so the admin app can show or hide premium screens |

Public routes go on the cross-tenant allowlist with a note; every bearer route gets a cross-tenant fixture.

### 5.1 Public page read

The controller resolves the school in a school-less tenant transaction with `school_id_for_public_slug`, then runs `GetPublicSchoolPageQuery` inside `runInTenant({ schoolId, userId: null })`. The handler composes, via the bus: the school profile and branches with opening hours (school), `ListPublicPriceItemsQuery` (billing: active items with the flag; name, description, amount, currency), `ListInstructorNamesQuery` (identity `MembershipDirectory`: display names of active instructor memberships; only if `show_instructors`), approved reviews (school; newest 20, with average rating and count). Response is cacheable for 60 s (`Cache-Control: public, max-age=60`). Unpublished or unknown slug → `404 school_not_found`.

### 5.2 Lead capture

Request: `{ fullName, phone?, email?, licenceClass, message?, isMinor, guardianName?, guardianContact?, consentTextVersion, website?: '' }`. `website` is a honeypot: a non-empty value returns `201 { id }` with a throw-away id, without writing anything. The controller resolves the school as in §5.1 and checks the plan feature; a school without `enrolment_page` returns 404 like an unpublished page.

Domain rule `dedupeLead` (pure): if a lead with the same phone or email exists in the last 30 days and is not `lost`, the command returns that lead's id and appends the new message to `note` instead of creating a second row. Response: `201 { id }` either way.

Events: `LeadCaptured` v1 `{ leadId, source, licenceClass, isMinor, fullName, capturedAt }`.

The messaging subscriber for `LeadCaptured` notifies every active membership with `leads.read` (owner, office) with template `lead_captured` (push, email when no device). Quiet hours apply as for other templates.

### 5.3 Conversion

`ConvertLeadCommand(actor, leadId, body)` where `body` is the admin's pre-filled `CreateStudentRequest` plus `{ invite: boolean, roles: ['student'] | ['student','parent'] }`. Inside one transaction it:
1. Loads the lead (404 if missing, 409 `lead_already_converted` if converted).
2. Executes training's `CreateStudentCommand` (same transaction).
3. If `invite`, executes identity's `CreateInvitationCommand` for the lead's contact (and, for a minor, a parent invitation to the guardian contact after `LinkGuardianCommand`, as the admin student screen already does).
4. Sets `status = converted`, `student_id`, `converted_at`; appends `LeadConverted` v1 `{ leadId, studentId, convertedAt }`.

The `Idempotency-Key` makes a double click safe.

### 5.4 Reviews

`SubmitReviewCommand(actor, rating, text)`: the student must have a `test_attempts` row with `kind = practical` and `result = pass` (training public query `HasPassedPracticalQuery(studentId)`); otherwise `403 review_not_available`. One review per student (`409 review_exists`). Appends `ReviewSubmitted` v1.

`ModerateReviewCommand` sets `approved` or `hidden`; appends `ReviewModerated` v1. Only approved reviews are public. The school is told on the moderation screen that hiding negative reviews is their choice but DriveOS asks every passing student, never only happy ones.

Review request: messaging subscribes to `TestAttemptRecorded`; when `kind = practical` and `result = pass` it sends `review_request` to the student (push, email when no device; skipped when the student has no login) with the app deep link `driveos://student/review` and, when set, the school's `external_review_url`. Sent at most once per student (`dedupe_key = review_request:<studentId>` on `notifications`).

### 5.5 Reporting

`school-metrics.projection` consumes `LeadCaptured` (+1 `leads_captured` on the capture day) and `LeadConverted` (+1 `leads_converted`, insert `rm_lead_students`). On `PaymentSucceeded` and `CashPaymentRecorded` it adds the amount to `lead_revenue_minor` when the payer's `studentId` is in `rm_lead_students`. The growth report reads the three sums for the month. Both the growth report email and the admin reports page show "Leads → enrolments → revenue" with the Pro upgrade sentence from the report ("two or three extra enrolments cover Pro").

## 6. Clients

### 6.1 Admin (`apps/admin`)

- `/s/$slug` (outside `_app`, no auth): the public page. Sections: header (name, headline, address, opening hours), buttons (WhatsApp, call), prices, instructors, reviews (average, count, list), enrolment form. The form has the minor toggle with guardian fields and the consent text (i18n key `publicPage.consent.v1`), a hidden `website` field, and shows a success state. Mobile-first layout, Tailwind, no shadcn dependency on the authenticated shell.
- `/leads` (nav item, `leads.read`): table with status tabs (new, contacted, converted, lost), search, detail drawer with notes and status actions, "Convert" dialog pre-filled from the lead that opens the existing create-student form fields and an "invite now" switch.
- `/settings/public-page` (`public_page.manage`): slug with availability check (`409 slug_taken` on save), published switch, profile fields, price-item flags (edits `show_on_public_page` through `PATCH /v1/price-items/{id}`), preview link, reviews moderation table.
- `/reports`: funnel block on the growth report.
- Navigation items are hidden when the plan lacks `enrolment_page`; the settings page shows an upgrade notice instead of the form.

### 6.2 Mobile (`apps/mobile`)

- Student screen `student/review`: 1–5 stars and text, available only when the API says the student may review (`GET /v1/me` → `canReview`, derived by the identity query from `HasPassedPracticalQuery`); otherwise the route redirects home. Deep link target of `review_request`.

## 7. Permissions

New: `public_page.manage` (owner), `leads.read` and `leads.manage` (owner, office), `reviews.moderate` (owner, office), `reviews.submit` (student). Added to the permission map, the admin `permissions.ts`, and the role tests.

## 8. Privacy and abuse

- The lead form shows a consent text with a version; the version and time are stored with the lead. Minors: the guardian's name and contact are required and the consent text says a parent or guardian submits the form (Albania Law 124/2024, Kosovo Law 06/L-082).
- Rate limits: `leads` 10 per IP per hour per route; `public-page` 120 per IP per hour. Honeypot field. There is no per-contact limit (the rate-limit guard keys contacts on `body.contact`, which the lead form does not send); the 30-day dedupe absorbs repeat enquiries instead.
- Leads in `lost` or `converted` state are deleted 12 months after they were closed by the daily purge job (training `training.lead-purge` per-school job, `15 3 * * *`); `request_ip_hash` is nulled after 30 days.
- Reviews show only first name and initial. Anonymizing a student deletes their review.
- Staff reads of a lead are not audited (a lead is not a student record); conversion is audited through the student creation.

## 9. Errors

`404 school_not_found` (unknown, unpublished or no plan feature), `409 slug_taken`, `409 lead_already_converted`, `409 review_exists`, `403 review_not_available`, `403 feature_not_in_plan` (bearer routes that need `enrolment_page`: public-profile `PUT` with `published: true`, `POST /v1/leads`).

## 10. Testing

- `domain/` unit tests: slug validation and reserved words, `dedupeLead`, lead consent rules (minor needs guardian), display-name derivation, review eligibility.
- Handler tests against the compose DB: capture (dedupe, honeypot, consent stored), convert (student + invitation in one transaction, idempotent, 409 on repeat), reviews (eligibility, one per student, moderation), profile (slug uniqueness across schools through the definer function, unpublished → 404).
- `security-definer.test.ts`: `school_id_for_public_slug` returns only the listed column and nothing for unpublished or suspended schools.
- Projection tests: metrics and `rm_lead_students`, revenue attribution, stale-event rejection.
- Subscriber tests: `lead_captured` recipients, `review_request` sent once and only on a passed practical attempt.
- Cross-tenant route test: fixtures for every bearer route; allowlist entries with notes for the two public routes.
- Admin: Playwright mock-mode tests for the public page (form success, minor toggle), leads inbox (convert), settings (publish). Mobile: component test for the review screen.
- Gates: `pnpm generate && pnpm lint && pnpm typecheck && pnpm test`, migrations on a fresh DB, seed updated (Fahrschule Spree gets a published profile `fahrschule-spree`, two public price items and one approved review).

## 11. Delivery

One branch per module, PRs to `main`, in this order: platform (plan features, `/v1/me` features) → school (profile, reviews, public read, definer function) → billing (price flag, public price query) → training (leads, capture, convert, purge) → reporting → messaging (templates, subscribers) → admin → mobile. Shared DTOs and events are added in the PR of the module that owns them.
