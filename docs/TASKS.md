# DriveOS Phase 1 — Conductor workspaces

Run these as separate Conductor workspaces. Each workspace branches from `master` and opens a PR to `master`. Merge a step before starting the steps that depend on it.

| Step | Workspaces | Depends on | Notes |
| --- | --- | --- | --- |
| 0 | `scaffold` | — | |
| 1 | `db-core` | 0 | Full Phase 1 schema in one go |
| 2 | `cqrs-kernel` | 1 | Buses, outbox, relay, projections, idempotency, test harness |
| 3 | `identity`, `contracts` | 2 | Parallel |
| 4 | `school-platform`, `scheduling-core`, `training`, `billing`, `theory`, `docs-messaging` | 3 | Parallel; **merge one at a time** (see "Merging") |
| 5 | `slot-offers`, `offline-sync`, `reporting` | 4 (see each prompt) | Parallel |
| 6a | `admin-shell`, `mobile-shell` | 3 (`contracts` mock server) | Parallel; can start while step 4 runs |
| 6b | `admin-calendar`, `admin-students`, `admin-money-inbox`, `mobile-student`, `mobile-instructor`, `mobile-parent` | 6a; real API from 4/5 | Parallel |
| 7 | `hardening` | all | |

Every prompt assumes the agent reads `CLAUDE.md` and `docs/SPEC.md` §3 first. Every workspace finishes with `pnpm generate && pnpm lint && pnpm typecheck && pnpm test` green, migrations applying on a fresh DB, and every new route covered by the cross-tenant route test.

## Merging

- **Schema.** `db-core` creates every Phase 1 table. Later workspaces should rarely need schema changes. If one does:
  - put the change in its own module's schema file;
  - before merging, rebase onto `master`, delete the branch's generated migration and re-run `drizzle-kit generate`.
  - Never edit a merged migration.
- **Step 4 order.** Merge in the order the PRs become ready, one at a time. Rebase the next PR after each merge.
- **Generated files.** The OpenAPI document and API client are generated at build time and are not committed, so they cannot conflict.
- **Interfaces.** Cross-module interfaces and event schemas are fixed by `contracts`. If a module needs to change one, it changes `packages/shared` in its own PR and says so in the PR description.

---

## 0. scaffold

```
Read CLAUDE.md and docs/SPEC.md §1 and §3. Set up the monorepo exactly as CLAUDE.md describes:
- pnpm workspaces + Turborepo with apps/api (NestJS + @nestjs/cqrs, entry points main.ts and worker.ts), apps/admin (React 19 + Vite + TanStack Router/Query/Table/Form + Tailwind + shadcn/ui), apps/mobile (Expo + expo-router + TanStack Query), packages/shared.
- Strict TypeScript, ESLint (including an import rule that forbids apps/api/src/modules/<a> from importing modules/<b> except via its index.ts), Prettier, and Vitest in every package. Root scripts: dev, build, generate, lint, typecheck, test. Turbo runs generate before build, typecheck and test.
- docker-compose.yml with Postgres 16 (with btree_gist available), Redis, MinIO and Mailpit, plus .env.example for every app.
- apps/api: health endpoint; config module with zod-validated env; OpenAPI at /docs; an `openapi:emit` script that writes openapi.json without connecting to the DB; the JSON error format from CLAUDE.md; structured JSON logs with request id.
- packages/shared: a `generate` script that builds the typed client and TanStack Query hooks from openapi.json. Generated output is gitignored.
- i18n set up in admin, mobile and api (en only), with one example key each.
- GitHub Actions CI running generate, lint, typecheck and test with the compose services.
Done when `docker compose up -d && pnpm i && pnpm dev` starts the api, worker, admin and mobile dev servers, and CI is green. Do not add business logic or tables.
```

## 1. db-core

```
Read CLAUDE.md and docs/SPEC.md §3, §5 and §6. In apps/api:
- Add Drizzle ORM and drizzle-kit migrations. Create EVERY table in SPEC §6.1, one schema file per module (src/modules/<module>/infra/schema.ts, kernel in src/kernel/schema.ts). Include:
  - the three EXCLUDE constraints on lessons and the btree_gist extension;
  - the CHECK constraint on ledger_entries;
  - the partial unique index on platform_charges;
  - all other unique indexes listed.
  Use custom SQL migrations for anything drizzle can't express.
- Create the roles in SPEC §6.2 (driveos_owner, app_rw, app_system) with grants: app_rw gets INSERT only on outbox and INSERT/SELECT only on audit_log; app_system has BYPASSRLS. Enable and FORCE RLS on every tenant table using the exact policy in SPEC §6.1, plus the noted policies on users, devices, platform_admins and audit_log.
- Create the SECURITY DEFINER functions in SPEC §6.2.
- TenantContext: a Nest request-scoped provider that runs the handler inside an app_rw transaction with set_config('app.school_id', …, true) and set_config('app.user_id', …, true). Stub the auth for now (header X-Dev-School / X-Dev-User, enabled only when NODE_ENV=development or test).
- Seed script: two schools with settings, opening hours, a branch each, plans (solo, standard), an owner, an office user, two instructors (one being owner+instructor in the second school), two vehicles, lesson types (standard 60 min, night 45 min costing 60 credit minutes, exam), five students (one a minor with a guardian), instructor assignments, syllabus items, price items (single lesson, 10-lesson package, premium theory, exam car), and a SAMPLE question pack.
- Tests:
  - migrations apply on an empty DB;
  - with app.school_id = A, every tenant table returns no rows of school B and inserting a B row fails;
  - with app.school_id unset, tenant tables return zero rows (no error);
  - the table owner is not used by the app (app_rw cannot bypass RLS);
  - overlapping lessons for the same instructor, vehicle or student are rejected by the database, and cancelled lessons don't block;
  - each SECURITY DEFINER function returns only its listed columns.
```

## 2. cqrs-kernel

```
Read CLAUDE.md and docs/SPEC.md §3 in full. Build src/kernel in apps/api (no business modules):
- Command, query and event base types. EventPublisher.append() inserts into outbox inside the current TenantContext transaction. A sub-command executed from a handler joins the same transaction.
- A module template: an example "ping" module with one command, one query, one event, one subscriber and one projection, following the CLAUDE.md layout. Delete it at the end, or keep it under test/fixtures only.
- Worker:
  - outbox relay as in SPEC §3.3 (app_system, FOR UPDATE SKIP LOCKED, one BullMQ job per subscriber, published_at) and the hourly delivery reconciler;
  - subscriber registry with event_deliveries idempotency, exponential backoff, dead_letters after 10 attempts;
  - projection base class with aggregate_version staleness checks and an optional per-school advisory lock (needed by change_feed);
  - a per-school job runner that enumerates schools as app_system and runs each school's work in its own app_rw tenant transaction.
- @Idempotent() interceptor backed by idempotency_keys (SPEC §3.2 step 4), with 24 h purge.
- Error mapping: zod → 400 validation_error, a not-found convention → 404, Postgres exclusion violation (23P01) → 409 with a code chosen by the handler.
- Test harness:
  - a helper to run code as school A/B;
  - an event-assertion helper (expect events appended);
  - a worker drain helper for tests;
  - the generic cross-tenant route test, which walks every registered route, creates the resource as school A where a fixture exists, then calls it as school B and expects 403/404. Routes opt in with a fixture; CI fails if a route has no fixture and isn't on an explicit allowlist.
- Tests: outbox written atomically (rollback → no event); relay delivers at-least-once and the subscriber runs once; late-committing events are still delivered; idempotent replay returns the stored response; a reused key with a different body returns 422.
```

## 3a. identity

```
Read CLAUDE.md, docs/SPEC.md §3, §4, §6.1 (identity), §6.2 and §7 ("Login", "Invitation", "Support access" token shape). Implement the identity module with commands, queries and events:
- One-time-code login by phone (SmsSender adapter) or email (EmailSender → Mailpit): auth_login_allowed check, always 202, hashed codes, 5-min expiry, 5 attempts, rate limits per contact, IP and country prefix (Redis).
- JWT access tokens (15 min) with userId, membershipId, schoolId, roles. Rotating refresh tokens in families with reuse detection and a 30-second grace window. Lifetime 30 days web / 90 days mobile. Logout revokes the family.
- Invitations with role sets (office, instructor, student, parent; owner only via platform onboarding). Accept creates the user if needed and the membership, or merges roles. A minor student's membership starts pending_consent and is activated by the GuardianConsentGiven event.
- GET /v1/me (via auth_memberships_for_user), POST /v1/me/switch-school, PATCH /v1/memberships/{id} (roles, branches, permission grants, disable), POST /v1/devices.
- The permission map from SPEC §4, plus a PermissionGuard with @RequirePermission(...), effective permissions = union of roles + grants (Redis cache invalidated on MembershipPermissionsChanged). Replace db-core's dev auth stub with the real AuthGuard wired to TenantContext. Keep the dev headers only in test.
- Export identity.MembershipDirectory (SPEC §3.4).
- Tests: each role's allowed and denied cases; cross-tenant denial; owner+instructor membership gets both permission sets; refresh reuse after the grace window revokes the family; parallel refresh within the grace window succeeds; a code is not sent to unknown contacts, but the response is identical.
```

## 3b. contracts

```
Read CLAUDE.md and docs/SPEC.md §3, §6, §7 and §8. This workspace fixes the interfaces that step 4 builds against, so the step-4 workspaces can run in parallel. No business logic.
- packages/shared/src/events: a zod schema + version for every event in SPEC §3.6.
- packages/shared/src/dto: zod request/response schemas for every endpoint in SPEC §8 (except identity, which 3a owns).
- apps/api: for every module in step 4, an index.ts exporting the public command/query classes and the same-transaction service interfaces (billing.LedgerWriter, platform.AuditWriter), each with an in-memory fake for tests. Add controller stubs that return 501 but are fully decorated for OpenAPI, so `pnpm generate` produces the complete client.
- A mock server for the frontends: MSW handlers generated from the OpenAPI document, with realistic fixture data from the seed. Exported from packages/shared/mocks.
- A short docs/CONTRACTS.md listing each module's public commands, queries, events and services.
- Tests: every event schema round-trips; the generated client typechecks; every stubbed route is in the OpenAPI document.
```

## 4a. school-platform

```
Read CLAUDE.md and docs/SPEC.md §3, §4, §5–§8 for the school and platform modules, plus "Support access", "Platform statement" and D7/D10. Implement:
- school: GET/PATCH school profile (legal name, tax id, address, time zone, currency, locale), settings, opening hours, branches, vehicles, staff list (via identity's MembershipDirectory), payment account connection through PaymentProvider.connectAccount (fake in dev).
- platform:
  - POST /v1/platform/schools (creates the school, settings, subscription and owner invitation);
  - plans CRUD;
  - support sessions (start/end, read-only support token, 60-min max, audit every request);
  - AuditWriter implementation;
  - GET /v1/audit-log for owners;
  - platform statements list and mark-paid (method bank_transfer or cash, reference required for bank transfer, audited).
  (The monthly statement job itself is in billing.)
- Tests: only platform_admin can use /v1/platform/*; a support token can read but not write and every call is audited; an owner can't change another school; settings validation (time zone is IANA, currency is ISO 4217).
```

## 4b. scheduling-core

```
Read CLAUDE.md and docs/SPEC.md §3 and the scheduling parts of §5–§8, plus flows "Book", "Move", "Cancel", "Complete / no-show" and D2/D3/D8. Implement (no slot offers, no sync; those are step 5):
- Lesson types, availability (local wall-clock times, valid_from/to), time off, GET /v1/calendar with filters, GET /v1/calendar/free-slots.
- Domain functions (pure, unit-tested): availability expansion per date in the school time zone including DST rules; cancellation window decision; min-gap check; move-inside-window rule.
- Lessons: book, move, cancel, complete, no-show via commands, using billing.LedgerWriter in the same transaction (lockStudent → balance → debit/restore) and consuming the exam_car entitlement for exam-kind lessons. Map 23P01 to 409 lesson_conflict with the conflicting period. Events per SPEC §3.6.
- Subscriber: LessonBooked/LessonMoved/LessonCancelled → BullMQ reminder jobs (24 h, 2 h) with deterministic ids; the job re-checks the lesson and then sends via messaging's public SendNotification command.
- Until billing and messaging are merged, use the contracts fakes.
- Tests:
  - clash rules (instructor, vehicle, student);
  - cancellation window edges (exactly at the window, 1 s inside);
  - staff vs student cancel;
  - concurrent student bookings can't overdraw (two parallel requests, balance for one);
  - allow_negative_balance on and off;
  - DST spring-forward and fall-back availability;
  - moved lesson replaces its reminders.
```

## 4c. training

```
Read CLAUDE.md and docs/SPEC.md §3, §4 and the training parts of §5–§8, plus "Student data export and deletion". Implement:
- Students (with date_of_birth and minor detection from school settings), enrolments (StudentEnrolled fires for each enrolment; billing charges only the first), archive.
- Instructor assignment (student_instructors) and the "instructor sees student" rule from SPEC §4, enforced in every query.
- Guardian links and consent (POST /v1/guardians/{linkId}/consent → GuardianConsentGiven).
- Syllabus items, progress entries, private_notes (never returned to student or parent: a separate query, no shared serializer), test attempts, GET /v1/students/{id}/progress per syllabus item.
- The rm_student_list projection (balance and lessons come from events).
- Export (JSON + PDF) and anonymize.
- Tests: per role (instructor can't see an unassigned student; parent only sees linked students with consent; student never receives private notes from any endpoint); anonymize keeps financial rows; the projection converges after replaying events twice.
```

## 4d. billing

```
Read CLAUDE.md and docs/SPEC.md §3 and the billing parts of §5–§9, plus flows "Buy", "Cash / bank transfer", "Refund", "Per-student fee", "Platform statement" and D1–D3/D6/D7. Implement:
- Price items (with tax_rate_bp, credit_minutes, entitlement_kind), GET /v1/shop for students, ledger and balance endpoints, manual adjustments (owner/office, audited).
- LedgerWriter (the same-transaction service from contracts), with pg_advisory_xact_lock per student.
- Entitlements.
- PaymentProvider interface + FakePaymentProvider with a local pay page and signed webhooks. POST /v1/checkout (school's connected account, disabled without one). Webhook: verify, find the school via billing_school_for_payment, idempotent on (provider, provider_ref), purchase entry + entitlement + invoice.
- InvoicePolicy adapter (generic dev policy) with invoice_counters under row lock (gapless per series), seller/buyer snapshots, tax lines, PDF download (i18n). Credit notes for refunds. Issued invoices are immutable.
- Cash and bank-transfer payments, refunds (provider or recorded) with minutes_removed.
- Platform billing: StudentEnrolled → student_fee (first enrolment only), StudentArchived → reversal within 14 days; a monthly statement job (app_system enumerates schools; per-school app_rw transactions) and PlatformStatementIssued.
- Tests: duplicate webhooks; duplicate checkout with the same Idempotency-Key; webhook for an unknown provider_ref; refunds and credit notes; gapless numbering under concurrency; balance after book/cancel/refund cycles; student fee charged once across re-enrolments; reversal rules.
```

## 4e. theory

```
Read CLAUDE.md and docs/SPEC.md (theory module, "Theory session", §9 question pack JSON, ExamRules, D9). Implement:
- QuestionBankImporter (JSON) + CLI, POST /v1/platform/question-packs/import and publish. Packs are global and versioned per country, licence class and language; exam rules are stored on the pack.
- ExamRules adapter with the fraction and error_points strategies (pure, unit-tested).
- GET /v1/question-packs/current for the student's licence class and exam language.
- Sessions:
  - practice, mock and mistakes modes;
  - question_ids fixed at start;
  - deadline_at enforced server-side;
  - answers, finish with score and pass, stats;
  - premium gating per D9 (entitlement via billing's public query, or theory_premium_free).
- Question media served via ObjectStorage signed URLs.
- Tests: mock draws follow per-category counts; scoring and pass/fail for both strategies including an instant-fail question; answers after the deadline are rejected; mistakes mode only draws the latest-wrong questions, matched across pack versions by external_ref; 4th mock in a week is blocked without premium.
```

## 4f. docs-messaging

```
Read CLAUDE.md and docs/SPEC.md (documents and messaging modules, "Chat", D5). Implement:
- ObjectStorage adapter (MinIO, server-side encryption): signed upload URL (size and mime limits), complete-upload, signed download URL (5 min), document records, access rules per role. Staff downloads are audited.
- Contract templates; contracts with a body snapshot; click-to-sign recording signer, role, time, IP and user agent. A minor's contract needs both the student's and a consenting guardian's signature before it is complete.
- Conversations (student↔school, student↔instructor), members with last-read pointers, messages, read endpoint. Owner/office can read but not post in student↔instructor chats. Retention job.
- Notifications: the SendNotification command (public), PushSender/SmsSender/EmailSender adapters, i18n templates, quiet hours with the per-template timing rules in SPEC §7 "Notifications and quiet hours" (deferred, advanced, immediate, email-only at night), device tokens from identity. Subscribers for InvitationCreated, lesson events, InvoiceIssued, ContractCreated, PlatformStatementIssued.
- Tests: document access across roles and tenants; an expired download URL fails; a minor's contract isn't complete with only the student's signature; office can read but not post in instructor chats; quiet hours defer an invoice push, advance a 2 h reminder for an 08:00 lesson to the evening before, and don't hold a same-day cancellation.
```

## 5a. slot-offers

```
Depends on scheduling-core and docs-messaging being merged. Read CLAUDE.md and docs/SPEC.md flow "Fill a gap". Implement:
- Waiting list endpoints.
- Offer creation from LessonCancelled (more than 2 h away), from a nightly gap scan (next 7 days, gap ≥ the shortest active lesson type), and manually.
- Audience selection (pure, unit-tested domain function).
- Notifications respecting quiet hours.
- Accept with the conditional update plus normal booking in one transaction (booked_via = slot_offer).
- Expiry job; GET /v1/slot-offers for the student.
- Tests: two students accepting at once → exactly one lesson; an expired offer is rejected; waiting-list students are offered before area matches; a student without enough credit isn't offered.
```

## 5b. offline-sync

```
Depends on scheduling-core and training being merged. Read CLAUDE.md and docs/SPEC.md §3.5 and flow "Instructor offline sync". Implement:
- The change_feed projection (single writer per school via advisory lock), including revoke rows when an instructor is unassigned or a lesson moves to another instructor.
- POST /v1/sync: ordered ops, a savepoint per op, sync_operations replay, version checks, conflict results with server state, last-write-wins in arrival order for progress and private notes.
- GET /v1/sync?cursor=: audience filtering, current entity state, next cursor.
- Tests:
  - replaying the same batch is a no-op with identical results;
  - a stale base_version is rejected with the server state;
  - a booking conflict is returned per op while later ops still apply;
  - two transactions committing out of order never cause a cursor to skip a change;
  - an unassigned student produces a revoke.
```

## 5c. reporting

```
Depends on scheduling-core and billing (slot-offers optional; slot metrics are zero until it merges). Read CLAUDE.md and docs/SPEC.md (reporting module, flow "Monthly growth report" with the metric definitions). Implement:
- The rm_school_metrics_daily projection (days bucketed in the school's time zone).
- The monthly growth report job (03:00 local on the 1st, per school), growth_reports, GrowthReportGenerated → owner notified.
- GET /v1/reports/growth?month= and the no-shows, revenue, pass-rate and utilisation endpoints for a date range. All read models only; no reads of other modules' tables.
- Tests with seeded event streams: each metric matches its definition; a payment at 23:30 local on the last day lands in the right month; replaying events doesn't double count.
```

## 6a. admin-shell

```
Read CLAUDE.md and docs/SPEC.md §1, §4 and §8. Build the apps/admin foundation using the generated client and TanStack Query hooks (MSW mocks from packages/shared/mocks until the API is merged):
- TanStack Router file-based routes with typed search params; an auth flow (one-time code, refresh, school switcher); role-aware navigation (owner vs office, permission-based hiding); the layout shell; i18n; error/empty/loading patterns; a TanStack Table wrapper with cursor pagination; TanStack Form + zod field components.
- Screens: login, home dashboard led by the growth report, school settings and opening hours, branches, vehicles, staff and invitations, lesson types, price items.
- Tests: Vitest + Testing Library for the shell and forms. One Playwright smoke test against MSW.
```

## 6a. mobile-shell

```
Read CLAUDE.md and docs/SPEC.md §1 and §4. Build the apps/mobile foundation:
- expo-router with role-based route groups (student, instructor, parent); one-time-code login; secure token storage and refresh; school switcher; i18n.
- TanStack Query with persisted cache for read-only screens; push registration (POST /v1/devices); online/offline detection; shared UI kit.
- MSW (`msw/native`) mocks from packages/shared/mocks until the API is merged.
```

## 6b. admin-calendar

```
After admin-shell. Build the week/day calendar per instructor and vehicle: drag-to-move and resize with optimistic updates that roll back on 409 lesson_conflict and show the conflicting period; create a booking from free slots; cancel with a late-cancel warning and an owner/office override; availability and time-off editors; waiting list and manual slot offers.
```

## 6b. admin-students

```
After admin-shell. Build the students list (rm_student_list via TanStack Table, search, filters), student profile (progress per syllabus item, private notes for staff, tests, balance and ledger, lessons, documents, contracts, guardians and consent status, instructor assignment), invitations, export and anonymize (with confirmation).
```

## 6b. admin-money-inbox

```
After admin-shell. Build invoices and credit notes (PDF), refunds, cash and bank payments, ledger adjustments, the payment account connection, platform statements, the chat inbox (school conversations plus read-only instructor chats), reports (no-shows, revenue, pass rate, utilisation, growth history), and the audit log view.
```

## 6b. mobile-instructor

```
After mobile-shell and offline-sync. Build the offline diary: expo-sqlite store, op queue with UUIDv7 op_ids, a sync loop (push ops, then pull the change feed), day and week views, complete a lesson with syllabus progress and private notes, no-show, record cash, open the pickup in Google/Apple Maps, chat, push reminders. Show conflicts clearly with the server state and a "keep server / retry" choice. Tests for queue replay and conflict handling.
```

## 6b. mobile-student

```
After mobile-shell. Build: theory practice, mock exam with a server deadline timer, mistakes test, premium gating; book and cancel lessons within the rules (show the late-cancel warning); shop (packages and upsells) and checkout via the provider page; fill-the-gap offers (accept); balance; progress (no private notes); documents and contract signing; chat.
```

## 6b. mobile-parent

```
After mobile-shell. Build: guardian consent flow; linked students' lessons, progress, invoices; pay; book and cancel for the student; co-sign contracts.
```

## 7. hardening

```
Review the whole repo against CLAUDE.md rules and SPEC §10:
- Confirm every route is covered by the cross-tenant route test (no allowlist leftovers) and every SECURITY DEFINER function by a column test.
- Rate limits on all auth and public endpoints.
- Alerts for dead letters, outbox lag, webhook failures and sync backlog.
- Backup/restore and PITR notes; a load test for booking contention and the relay.
- An end-to-end smoke test: platform creates school → owner invites student (minor) → guardian consents → buy package → book lesson → instructor completes offline and syncs → student sees progress and invoice → monthly growth report includes the payment.
```
