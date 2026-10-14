# DriveOS — implementation spec (Phase 1)

## 1. Product

Driving schools subscribe to DriveOS to run their school. Their students (and optionally parents) get the DriveOS app through the school by invitation. Three clients share one API:

| Client | Users | Main jobs |
| --- | --- | --- |
| Admin web (`apps/admin`) | School owner, office staff | Calendar, students, instructors, vehicles, prices, invoices, documents, reports |
| Mobile app, instructor mode (`apps/mobile`) | Instructors | Offline diary, lesson completion with progress notes, chat, navigation to pickup |
| Mobile app, student/parent mode (`apps/mobile`) | Students, parents | Theory practice and mock exams, book/cancel lessons, pay, progress, documents, chat |

Stack: TypeScript on Node.js (NestJS + `@nestjs/cqrs`), PostgreSQL 16, React (admin: Vite + TanStack Router/Query/Table/Form; mobile: Expo + TanStack Query). See `CLAUDE.md`.

## 2. Scope by phase

**Phase 1 (build now)**
1. Central calendar matching instructor, vehicle and student.
2. Offline instructor diary with reminders and navigation to the next pickup.
3. Digital student record: syllabus progress, lesson notes, test attempts.
4. Prepaid lessons with a 24-hour cancellation rule (configurable per school).
5. Student portal: invoices, payment, documents, contracts, chat.
6. Exam simulator on the official question bank with a "my mistakes" test.
7. Question packs in multiple exam languages.
8. Lesson packages and in-app upsells (extra lessons, pre-test package, car for the exam, premium theory pack).
9. Fill-the-gap slot offers and a waiting list.
10. Monthly growth report for the school owner.
Plus: auth and invitations, roles, school settings, platform billing to schools, platform admin and support access.

**Business model ("they grow, we grow"):** schools pay a small base subscription (free for solo instructors) plus a per-student fee (§7 "Per-student fee"). A payment take rate on in-app payments comes in Phase 2. Students never pay the platform directly. The school is the merchant of record for student payments (§11 D1). Every money-related feature must be measurable per school.

**Phase 2 (do not build yet):** learning plan to test date, streaks/leaderboards, parent view extras, student referral credits, practice-hours logbook, payment take rate, card collection of platform fees.

**Phase 3 (do not build yet):** drive scoring with phone sensors, AI mock road test, multi-branch group plans.

**Premium (Pro) features (built on Phase 1, sold through the plan):**
1. **Enrolment page.** A public web page per school at `/s/{slug}` in `apps/admin` (no login): name, headline, address, opening hours, click-to-WhatsApp and call buttons, the prices the school flags, instructors, approved reviews and an enquiry form with consent (guardian details for minors). Edited by the owner under School settings → Public page.
2. **Lead inbox.** Enquiries from the page and leads typed in by staff land in `/leads` (status `new|contacted|converted|lost`, notes); one click converts a lead into a student plus app invitation(s). Owner and office get a `lead_captured` notification. The growth report shows leads captured → converted → revenue from converted leads.
3. **Review requests.** After a passed practical test the student is asked once (`review_request`) to rate the school in the app; the school approves or hides each review; approved ones appear on the page.
4. **Plan gating.** Features are slugs in `plans.features` (first one: `enrolment_page`, on the Standard plan in the seed). `GET /v1/me` returns the active school's `features` so the admin app hides premium screens; the API enforces the gate (§11 D11).

Design and deviations: [`docs/superpowers/specs/2026-10-14-enrolment-page-design.md`](superpowers/specs/2026-10-14-enrolment-page-design.md). New permissions: `public_page.manage` (owner), `leads.read` and `leads.manage` (owner, office), `reviews.moderate` (owner, office), `reviews.submit` (student).

## 3. Architecture (CQRS, no event sourcing)

### 3.1 Processes

| Process | Entry | Does |
| --- | --- | --- |
| `api` | `apps/api/src/main.ts` | HTTP: auth, guards, controllers → CommandBus / QueryBus |
| `worker` | `apps/api/src/worker.ts` | Outbox relay, event subscribers, projections, BullMQ processors (reminders, offer expiry, monthly jobs) |

Both use the same modules. Postgres is the single source of truth: write tables, read models and the outbox all live in it. Redis is used only for BullMQ, rate limits and caches. No state lives only in Redis.

### 3.2 Request lifecycle

1. `AuthGuard` verifies the access token → `{ userId, membershipId, schoolId, roles }` or a support token (§7 "Support access").
2. `PermissionGuard` checks `@RequirePermission(...)` against the role map (§4) plus `permission_grants` (cached in Redis, invalidated by `MembershipPermissionsChanged`).
3. `TenantContext` opens a transaction on `app_rw`, then calls `set_config('app.school_id', …, true)` and `set_config('app.user_id', …, true)`.
4. `IdempotencyInterceptor`, on endpoints marked `@Idempotent()`:
   - looks up `(school_id, Idempotency-Key)`;
   - if the key exists with the same request hash, replays the stored response;
   - if the key exists with a different hash, returns `422 idempotency_key_reused`;
   - otherwise stores the response on commit.
5. The controller calls `CommandBus.execute(cmd)` or `QueryBus.execute(query)`.
6. The command handler writes its own tables and calls `EventPublisher.append(events)`, which inserts into `outbox` in the same transaction.
7. Commit. The response is the command result (`{ id, version }`), or a representation read from write tables in the same transaction when the client needs it, e.g. the booked lesson.

### 3.3 Events, outbox and subscribers

- `outbox(seq bigserial, id uuid, school_id null, type, version, aggregate_type, aggregate_id, aggregate_version, actor_user_id null, occurred_at, payload jsonb, published_at null)` is a system table. `app_rw` may only `INSERT`; `app_system` reads and updates it.
- **Relay** (worker, `app_system`):
  - Selects `published_at is null order by seq limit 100 for update skip locked`.
  - Enqueues one BullMQ job per subscriber, with `jobId = <subscriber>:<eventId>`, then sets `published_at`. It does not run the handlers itself.
  - It selects on `published_at is null`, not on a seq cursor, so rows that commit late are never skipped.
  - An hourly reconciler re-enqueues events published more than 1 hour ago that have no `event_deliveries` row for one of their subscribers. Postgres stays the source of truth even if Redis loses jobs.
- **Subscribers:**
  - Each event is handled in its own `app_rw` transaction with `app.school_id` set to the event's school.
  - Before handling, the subscriber inserts `event_deliveries(subscriber, event_id)` to get idempotency; a conflict means skip.
  - Failures retry with exponential backoff (BullMQ). After 10 attempts the event goes to `dead_letters` and an alert fires.
- **Projections** are subscribers that write `rm_*` tables. They ignore stale events by comparing `aggregate_version`.
- **Event envelope:** `{ id, type, version, schoolId, aggregateType, aggregateId, aggregateVersion, actorUserId, occurredAt, payload }`. Payload schemas live in `packages/shared/src/events`. Changing a payload means bumping `version`, and subscribers must accept the previous version for one release.

### 3.4 Cross-module rules

Modules interact only through:
1. **Bus.** Another module's public commands and queries (exported from its `index.ts`). A command sent from inside a handler joins the current transaction.
2. **Events.** Asynchronous and eventually consistent. This is the default for side effects: notifications, fees, reports, offers.
3. **Same-transaction services.** Only used where atomicity is required. The full list is:
   - `billing.LedgerWriter`: `lockStudent`, `balance`, `debit`, `restore`, `credit`, `adjust`. Used by scheduling to book, move, cancel and accept offers, and by billing itself.
   - `platform.AuditWriter`: `record(action, target, reason)`. Used by any module.
   - `identity.MembershipDirectory`: read-only lookups of memberships and roles in the current school.

Foreign keys across modules are allowed in the database. Reading another module's tables in code is not.

### 3.5 Read models (Phase 1)

| Read model | Owner | Fed by | Used by |
| --- | --- | --- | --- |
| `change_feed` | scheduling | lesson, student, assignment, vehicle, progress, availability events | `GET /v1/sync` |
| `rm_student_list` | training | student, assignment, lesson, ledger, progress events | admin student list, search |
| `rm_school_metrics_daily` | reporting | lesson, ledger, payment, refund, slot-offer, availability, `LeadCaptured`, `LeadConverted` events | reports, growth report |
| `rm_lead_students` | reporting | `LeadConverted` | attributing later payments of converted leads to `lead_revenue_minor` |

`change_feed` has a single writer, the projection, which holds an advisory lock per school. Its `seq` therefore follows commit order, so a sync cursor can never skip a row (§7 "Instructor offline sync").

### 3.6 Event catalog

| Module | Emits | Consumes |
| --- | --- | --- |
| identity | `InvitationCreated`, `MembershipCreated`, `MembershipRolesChanged`, `MembershipPermissionsChanged`, `MembershipDisabled` | `GuardianConsentGiven` (activates minor's membership) |
| school | `SchoolCreated`, `SchoolSettingsChanged`, `BranchChanged`, `VehicleChanged`, `PaymentAccountConnected`, `ReviewSubmitted`, `ReviewModerated` | `StudentAnonymized` (deletes the student's review) |
| training | `StudentCreated`, `StudentEnrolled`, `StudentArchived`, `StudentAnonymized`, `GuardianLinked`, `GuardianConsentGiven`, `InstructorAssigned`, `InstructorUnassigned`, `ProgressRecorded`, `TestAttemptRecorded`, `LeadCaptured`, `LeadStatusChanged`, `LeadConverted` | lesson events, ledger events (→ `rm_student_list`) |
| scheduling | `LessonBooked`, `LessonMoved`, `LessonCancelled`, `LessonCompleted`, `LessonMarkedNoShow`, `AvailabilityChanged`, `TimeOffAdded`, `WaitingListJoined`, `SlotOfferCreated`, `SlotOfferAccepted`, `SlotOfferExpired` | `LessonCancelled` (→ slot offer), `InstructorUnassigned`, student/vehicle events (→ `change_feed`) |
| billing | `PaymentSucceeded`, `PaymentFailed`, `CashPaymentRecorded`, `RefundIssued`, `LedgerEntryRecorded`, `EntitlementGranted`, `InvoiceIssued`, `CreditNoteIssued`, `PlatformChargeCreated`, `PlatformStatementIssued` | `StudentEnrolled`, `StudentArchived` (→ student fee / reversal) |
| theory | `QuestionPackPublished`, `TheorySessionFinished` | — |
| documents | `DocumentUploaded`, `ContractCreated`, `ContractSigned`, `ContractCompleted` | — |
| messaging | `MessageSent` | `InvitationCreated`, lesson events, `SlotOfferCreated`, `InvoiceIssued`, `ContractCreated`, `GrowthReportGenerated`, `PlatformStatementIssued`, `LeadCaptured` (→ `lead_captured` to owner and office), `TestAttemptRecorded` (passed practical → `review_request`) |
| reporting | `GrowthReportGenerated` | lesson, ledger, payment, refund, slot-offer, availability events, `LeadCaptured`, `LeadConverted` (→ lead funnel, `rm_lead_students`) |
| platform | `SupportSessionStarted`, `SupportSessionEnded`, `SubscriptionChanged` | — |

## 4. Roles and permissions

Roles attach to a **membership** (user × school). A membership holds a **set** of roles: a solo instructor-owner is one membership with `{owner, instructor}`. One user can hold memberships in several schools. The access token carries the active membership. Effective permissions are the union of the role permissions plus `permission_grants`.

| Role | Scope | Allowed | Denied |
| --- | --- | --- | --- |
| `platform_admin` (global, `platform_admins` table) | All schools via support sessions | Create schools, manage plans, publish question packs, read one school's data in a time-boxed support session with a reason (audited, read-only in Phase 1) | Unaudited access to student data, writes to school data |
| `owner` | Own school | Everything in the school | Other schools |
| `office` | Own school (assigned branches via `membership_branches`; none = all) | Students, enrolments, calendar, invoices, refunds, documents, messages, read instructor↔student chats | Subscription, payment account, prices (unless granted `prices.manage`) |
| `instructor` | Own diary, assigned students | Availability, own lessons, progress notes, private notes, test results, chat with own students, record cash | Other instructors' finances, prices, unassigned students |
| `student` | Self | Book/cancel within rules, pay, theory, view progress (no private notes) and documents, sign contracts, chat | Other students, private notes |
| `parent` | Linked students (consent given) | View lessons, progress, invoices; pay; book/cancel for the student; give consent; co-sign contracts | Edit training records |

**Implementation:**
- Permissions live in a map (`role -> Set<permission>`) checked by a NestJS guard, plus ownership checks in handlers.
- Permission names are `<resource>.<action>`, e.g. `lessons.create`, `lessons.cancel.own`, `invoices.read`.
- An instructor "sees" a student if there is an active `student_instructors` row, or a lesson between them in the last 90 days or in the future.

## 5. Modules (apps/api/src/modules)

| Module | Owns | Responsibilities |
| --- | --- | --- |
| `identity` | users, platform_admins, memberships, membership_branches, permission_grants, invitations, otp_codes, refresh_tokens, devices | One-time-code login, JWT access (15 min) + rotating refresh tokens, invitations, switch school, permission guard |
| `school` | schools, school_settings, opening_hours, branches, vehicles, school_payment_accounts, school_public_profiles, school_reviews | Profile, legal/tax details, time zone, currency, settings, opening hours, branches, vehicles, staff list, payment account connection; public enrolment page (profile, public read) and reviews |
| `scheduling` | lesson_types, availability, time_off, lessons, waiting_list, slot_offers, sync_operations, change_feed | Calendar, booking, moving, cancelling, completing; reminder jobs; fill-the-gap offers; offline sync |
| `training` | students, student_instructors, guardian_links, enrolments, syllabus_items, progress_entries, private_notes, test_attempts, rm_student_list, leads | Enrolment, assignment, guardians and consent, syllabus progress, notes, test results, export/anonymize; leads (capture, inbox, conversion to a student, purge) |
| `theory` | question_packs, questions, theory_sessions, theory_answers | Pack import/publish, practice/mock/mistakes sessions, stats |
| `billing` | price_items, ledger_entries, entitlements, invoice_counters, invoices, invoice_lines, payments, refunds, idempotency_keys, platform_charges, platform_statements | Shop, credits ledger, entitlements, checkout, webhooks, invoices and credit notes, refunds, cash; platform billing to schools |
| `documents` | documents, contract_templates, contracts, contract_signatures | Signed upload/download URLs, contracts with student and guardian signatures |
| `messaging` | conversations, conversation_members, messages, notifications | Chat, notifications (push/SMS/email) with quiet hours, templates |
| `reporting` | rm_school_metrics_daily, rm_lead_students, growth_reports | Growth report (with the leads funnel), revenue, no-shows, pass rate, utilisation |
| `platform` | plans (with `features`), subscriptions, support_sessions, audit_log | School onboarding, plans and plan features, support access, audit |
| `kernel` (not a business module) | outbox, event_deliveries, dead_letters | Buses, TenantContext, EventPublisher, relay, idempotency, test harness |

## 6. Data model (Phase 1)

### 6.1 Tables

Every table has `id uuid pk` (except the composite-key tables noted below), `created_at` and `updated_at`. **Tenant tables** (all tables below unless marked) also have `school_id uuid not null` and the policy `school_id = nullif(current_setting('app.school_id', true), '')::uuid`, with RLS forced. **[global]** tables have no `school_id`; they have no RLS unless a policy is noted, and only their owning module's code touches them. **[system]** tables have no RLS and only `app_system` may read them (`app_rw` gets `INSERT` where noted).

**identity**
```
users(id, full_name, phone unique null, email unique null, locale)                         -- [global] RLS: id = app.user_id OR has a membership in app.school_id
platform_admins(user_id pk)                                                                -- [global] RLS: user_id = app.user_id
memberships(id, school_id, user_id, roles text[], status [invited|pending_consent|active|disabled])   -- unique(school_id, user_id)
membership_branches(school_id, membership_id, branch_id)                                   -- pk(membership_id, branch_id)
permission_grants(school_id, membership_id, permission)                                    -- pk(membership_id, permission)
invitations(id, school_id, roles text[], phone null, email null, student_id null, token_hash, invited_by, expires_at, accepted_at null)
otp_codes(id, contact, code_hash, attempts smallint, expires_at, consumed_at null)         -- [global]
refresh_tokens(id, user_id, family_id, token_hash, membership_id, client [web|mobile], expires_at, rotated_at null, revoked_at null)   -- [global]
devices(id, user_id, platform [ios|android], push_token unique, locale, last_seen_at)      -- [global] RLS: user_id = app.user_id
```

**school**
```
schools(id, name, legal_name, tax_id null, address, country_code, time_zone, currency, locale, status [onboarding|active|suspended])   -- policy: id = app.school_id
school_settings(school_id pk, cancellation_window_hours int default 24, allow_negative_balance bool default false,
                min_gap_minutes int default 0, age_of_majority smallint default 18, quiet_hours_start time default '21:00',
                quiet_hours_end time default '08:00', slot_offer_ttl_minutes int default 120, theory_premium_free bool default false,
                chat_retention_months int default 24)
opening_hours(id, school_id, branch_id null, weekday smallint, opens time, closes time)     -- local time
branches(id, school_id, name, address, lat, lng)
vehicles(id, school_id, branch_id, plate, make_model, transmission, licence_class, active)
school_payment_accounts(id, school_id, provider, account_ref, status [pending|active|disabled])   -- unique(school_id, provider)
school_public_profiles(school_id pk, slug, published bool default false, headline null, description null, phone null,
                       whatsapp_number null, instagram_url null, facebook_url null, external_review_url null,
                       show_prices bool default true, show_instructors bool default true, version int)
  -- no id column; slug unique across all schools (school_public_profiles_slug_key), read cross-school only via school_id_for_public_slug
school_reviews(id, school_id, student_id unique, rating smallint, text null, display_name, status [pending|approved|hidden] default pending,
               submitted_at, moderated_at null, moderated_by_user_id null, version int)
  CHECK (rating BETWEEN 1 AND 5)   -- student_id FK students; one review per student (school_reviews_student_key)
```

**scheduling**
```
lesson_types(id, school_id, name, kind [lesson|exam], licence_class, minutes, credit_minutes, requires_vehicle bool,
             requires_entitlement [exam_car] null, active)
availability(id, school_id, instructor_membership_id, weekday smallint, start_time time, end_time time, valid_from date, valid_to date null)  -- local time
time_off(id, school_id, instructor_membership_id, period tstzrange, reason)
lessons(id, school_id, student_id, instructor_membership_id, vehicle_id null, lesson_type_id, credit_minutes int,
        period tstzrange, status [booked|completed|cancelled|no_show],
        pickup_address, pickup_lat, pickup_lng,
        booked_by_membership_id, booked_via [office|instructor|student|parent|slot_offer|sync],
        cancelled_at null, cancelled_by_membership_id null, cancel_reason null, late_cancel bool default false, version int)
  EXCLUDE USING gist (instructor_membership_id WITH =, period WITH &&) WHERE (status IN ('booked','completed'))
  EXCLUDE USING gist (vehicle_id WITH =, period WITH &&) WHERE (status IN ('booked','completed') AND vehicle_id IS NOT NULL)
  EXCLUDE USING gist (student_id WITH =, period WITH &&) WHERE (status IN ('booked','completed'))
waiting_list(id, school_id, student_id, lesson_type_id, preferred_windows jsonb /* [{weekday,start,end}] local */, area, active)
slot_offers(id, school_id, instructor_membership_id, vehicle_id null, lesson_type_id, period tstzrange,
            source [cancellation|gap|manual], offered_to_student_ids uuid[], accepted_by_student_id null, lesson_id null,
            expires_at, status [open|taken|expired|withdrawn])
sync_operations(school_id, op_id pk, membership_id, type, status [applied|rejected], result jsonb, applied_at)
change_feed(seq bigserial pk, school_id, entity, entity_id, op [upsert|delete|revoke], audience_membership_id null, at)
```
A lesson's `id` may be generated by the client (UUIDv7) when it is created offline. There is no separate `client_ref`.

**training**
```
students(id, school_id, user_id null, date_of_birth date, licence_class, exam_language, test_date null,
         area null, pickup_address null, pickup_lat null, pickup_lng null, status [active|archived|anonymized])
student_instructors(id, school_id, student_id, instructor_membership_id, is_primary bool, assigned_at, unassigned_at null)
guardian_links(id, school_id, student_id, guardian_user_id, consent_at null, consent_text_version null, revoked_at null)
enrolments(id, school_id, student_id, course_name, licence_class, started_at, ended_at null)
syllabus_items(id, school_id, licence_class, code, title, sort_order)
progress_entries(id, school_id, lesson_id, student_id, syllabus_item_id, level smallint, note, version int)
private_notes(id, school_id, lesson_id, student_id, author_membership_id, body, version int)    -- never returned to student/parent
test_attempts(id, school_id, student_id, kind [theory|practical], taken_on date, result [passed|failed], notes)
rm_student_list(school_id, student_id pk, full_name, licence_class, status, primary_instructor_name, balance_minutes,
                next_lesson_at, last_lesson_at, progress_pct, updated_at)
leads(id, school_id, status [new|contacted|converted|lost] default new, source [page|manual], full_name, phone null, email null,
      licence_class, message null, is_minor bool, guardian_name null, guardian_contact null, consent_text_version, consented_at,
      note null, student_id null, converted_at null, lost_at null, lost_reason null, request_ip_hash null, version int)
  CHECK (phone IS NOT NULL OR email IS NOT NULL)
  CHECK (NOT is_minor OR (guardian_name IS NOT NULL AND guardian_contact IS NOT NULL))
  -- indexes (school_id, status, created_at desc), (school_id, lower(email)), (school_id, phone); student_id FK students
```

**theory**
```
question_packs(id, country_code, licence_class, language, version, exam_rules jsonb, status [draft|published], published_at)   -- [global]
questions(id, pack_id, external_ref, category, body jsonb, media_key null, answers jsonb, correct jsonb, points smallint, explanation)   -- [global]
theory_sessions(id, school_id, student_id, pack_id, mode [practice|mock|mistakes], question_ids uuid[], started_at,
                deadline_at null, finished_at null, score null, max_score null, passed null)
theory_answers(id, school_id, session_id, question_id, given jsonb, correct bool, answered_at)
```

**billing**
```
price_items(id, school_id, name, kind [lesson|package|upsell|fee], credit_minutes null, entitlement_kind [premium_theory|exam_car] null,
            amount_minor /* gross, tax included */, currency, tax_rate_bp int, active, sort_order,
            show_on_public_page bool default false)
ledger_entries(id, school_id, student_id, entry_type [purchase|debit|restore|adjustment|refund], minutes int /* signed */,
               lesson_id null, payment_id null, refund_id null, price_item_id null, note null, created_by_membership_id null)
  CHECK ((entry_type IN ('purchase','restore') AND minutes > 0) OR (entry_type IN ('debit','refund') AND minutes < 0)
         OR (entry_type = 'adjustment' AND minutes <> 0))
entitlements(id, school_id, student_id, kind [premium_theory|exam_car], payment_id null, granted_at,
             consumed_at null, consumed_by_lesson_id null, revoked_at null)
invoice_counters(school_id, series, next_number bigint)                                      -- pk(school_id, series)
invoices(id, school_id, student_id, kind [invoice|credit_note], credit_note_for_id null, series, number,
         issued_at null, seller_snapshot jsonb, buyer_snapshot jsonb, subtotal_minor, tax_minor, total_minor, currency,
         status [draft|issued|paid])                                                        -- unique(school_id, series, number)
invoice_lines(id, school_id, invoice_id, price_item_id null, description, quantity, unit_minor, tax_rate_bp, tax_minor, total_minor)
payments(id, school_id, student_id, payer_user_id null, invoice_id null, method [in_app|cash|bank_transfer],
         provider null, provider_ref null, amount_minor, currency,
         status [pending|succeeded|failed|refunded|partially_refunded], recorded_by_membership_id null)   -- unique(provider, provider_ref)
refunds(id, school_id, payment_id, amount_minor, currency, minutes_removed int, reason, provider_ref null,
        credit_note_id null, status [pending|succeeded|failed])
idempotency_keys(school_id, key, endpoint, request_hash, response_status, response_body jsonb, created_at)   -- pk(school_id, key); purged after 24 h
platform_charges(id, school_id, kind [base_subscription|student_fee|student_fee_reversal|take_rate], student_id null,
                 period_month date, amount_minor, currency, statement_id null, status [pending|statemented])
  UNIQUE (school_id, student_id) WHERE kind = 'student_fee'
platform_statements(id, school_id, month date, total_minor, currency, status [issued|paid], issued_at, paid_at null,
                    paid_method [bank_transfer|cash] null, paid_reference null, marked_paid_by_user_id null)
```
Balance for a student = `sum(minutes)` over their ledger entries. Phase 1 values credit at cash basis: money lives on payments and refunds, and ledger rows carry only minutes (§11 D3).

**documents**
```
documents(id, school_id, owner_student_id null, kind, storage_key, mime, size_bytes, uploaded_by, status [pending|ready])
contract_templates(id, school_id, name, version, body, active)
contracts(id, school_id, student_id, template_id, template_version, body_snapshot, requires_guardian bool,
          status [pending|signed], completed_at null)
contract_signatures(id, school_id, contract_id, signer_user_id, signer_role [student|guardian|school], signed_at, ip, user_agent)
```

**messaging**
```
conversations(id, school_id, kind [student_school|student_instructor], student_id, instructor_membership_id null)
conversation_members(id, school_id, conversation_id, membership_id, last_read_message_id null)
messages(id, school_id, conversation_id, sender_user_id, body, sent_at)
notifications(id, school_id, user_id, channel [push|sms|email], template, payload jsonb, status [scheduled|sent|failed|skipped],
              scheduled_for, sent_at null)
```

**reporting**
```
rm_school_metrics_daily(school_id, day date, currency, revenue_in_app_minor, revenue_recorded_minor, refunds_minor,
                        lessons_completed, late_cancellations, late_cancel_minutes_kept, no_shows,
                        upsells_sold, upsell_revenue_minor, package_minutes_sold, slots_offered, slots_filled, slot_fill_minutes,
                        instructor_minutes_available, instructor_minutes_booked, lessons_due,
                        leads_captured, leads_converted, lead_revenue_minor)   -- pk(school_id, day); lead columns default 0
rm_lead_students(school_id, student_id pk, lead_id, converted_on date)   -- students who came from a lead; no FK to students
growth_reports(id, school_id, month date, currency, revenue_in_app_minor, revenue_recorded_minor, inapp_share_bp,
               late_cancellations_kept, late_cancel_minutes_kept, no_show_rate_bp, no_show_rate_prev3m_bp,
               upsells_sold, upsell_revenue_minor, slots_filled, slot_fill_minutes,
               leads_captured, leads_converted, lead_revenue_minor, generated_at)   -- unique(school_id, month)
```

**platform**
```
plans(id, code, name, base_amount_minor, student_fee_minor, currency, max_instructor_seats null,
      features text[] default '{}' /* feature slugs, e.g. enrolment_page */, active)   -- [global]
subscriptions(id, school_id, plan_id, started_at, ended_at null)
support_sessions(id, platform_admin_user_id, school_id, reason, started_at, expires_at, ended_at null)   -- [global]; owner reads own school's rows via GET /v1/audit-log
audit_log(id, school_id null, actor_user_id, support_session_id null, action, target_type, target_id, reason null, at)
  -- [global] RLS for SELECT: school_id = app.school_id; append-only: app_rw has INSERT/SELECT only, no UPDATE/DELETE
```

**kernel** — [system]
```
outbox(seq bigserial pk, id uuid unique, school_id null, type, version, aggregate_type, aggregate_id, aggregate_version,
       actor_user_id null, occurred_at, payload jsonb, published_at null)
event_deliveries(subscriber, event_id, delivered_at)                                         -- pk(subscriber, event_id)
dead_letters(id, subscriber, event_id, error, attempts, failed_at)
```

### 6.2 Database roles and functions

| Role | Login | RLS | Used by |
| --- | --- | --- | --- |
| `driveos_owner` | migrations only | owner | drizzle-kit migrate |
| `app_rw` | api, worker subscribers | enforced | All requests and per-school work |
| `app_system` | worker relay and schedulers | `BYPASSRLS` | Outbox relay, enumerate schools for scheduled jobs, platform statements |

`SECURITY DEFINER` functions owned by a no-login role, granted to `app_rw`. These are the only way to read across schools from a request:

| Function | Returns |
| --- | --- |
| `auth_find_user_by_contact(contact text)` | `user_id` or null |
| `auth_login_allowed(contact text)` | true if the contact belongs to an active membership, a pending invitation or a platform admin |
| `auth_memberships_for_user(user_id uuid)` | `(membership_id, school_id, school_name, roles, status)` |
| `auth_invitation_by_token_hash(hash text)` | `(invitation_id, school_id, roles, phone, email, student_id, expires_at, accepted_at)` |
| `billing_school_for_payment(provider text, provider_ref text)` | `school_id` |
| `auth_release_push_token(push_token text)` | nothing; removes the token from another user's device row |
| `platform_list_statements(filter_status, filter_school_id, filter_month, after_id, max_rows)` | statements of every school, for a platform admin only |
| `platform_statement_school(statement_id uuid)` | `school_id`, for a platform admin only |
| `billing_count_webhook_failures(since timestamptz)` | count of `payment_webhook_failures` across schools, only in a school-less scope (worker alert probe) |
| `auth_devices_for_school_members(user_ids uuid[])` | `(device_id, user_id, push_token, platform, locale)` of the given users that are members of `app.school_id` (notification dispatcher) |
| `auth_prune_device(device_id uuid, user_id uuid, seen_before timestamptz)` | nothing; deletes a member's device not seen after `seen_before`, only in a school scope without `app.user_id` |
| `school_id_for_public_slug(slug text)` | `school_id` of the public profile with that slug when it is published and the school is `active`, else null (public page and public enquiry form) |

Each function has a test proving it returns only the listed columns. Worker-scope access to tables outside the tenant predicate (`devices`, `payment_webhook_failures`) goes through these functions, never through extra RLS policies or `app_system`.

## 7. Key flows

**Login**
1. `POST /v1/auth/code {contact}` always returns `202`.
   - It sends a code only if `auth_login_allowed(contact)`. There is no public sign-up, so this check stops SMS-pumping fraud.
   - Codes are 6 digits, hashed, valid for 5 minutes, with at most 5 attempts.
   - Rate limits: 3 codes per contact per 15 minutes, 20 per IP per hour, and a daily cap per destination country prefix.
2. `POST /v1/auth/verify` returns an access token (15 min) and a refresh token. The refresh token lasts 30 days for web and 90 days for mobile; the longer mobile life covers instructors who stay offline.
   - With one active membership, it is selected automatically. With several, the token has no school until `POST /v1/me/switch-school`.
3. Refresh rotates the token.
   - Presenting a rotated token within 30 seconds returns the same successor. This grace window covers parallel refreshes when the app comes back online.
   - After 30 seconds, presenting a rotated token is treated as reuse and revokes the whole family.

**Invitation**
- Staff create an invitation with roles (and `student_id` for student or parent invitations). Messaging sends it via `InvitationCreated`.
- Accept:
  1. `auth_invitation_by_token_hash` returns the invitation and its school.
  2. A tenant transaction for that school creates the user if needed and the membership (or merges the roles into an existing membership).
- If the student is a minor, the membership starts as `pending_consent`. It becomes `active` when a linked guardian gives consent (`GuardianConsentGiven`).
- `users.phone` and `users.email` are unique login identifiers (§11 D4). An invitation to a contact that already belongs to a user attaches to that user.

**Book a lesson (office, instructor, student or parent)**
1. Validate the slot against:
   - the instructor's availability, converted per date in the school's time zone (DST: start times in a spring-forward gap are invalid; fall-back ambiguity resolves to the first occurrence);
   - time off;
   - opening hours;
   - `min_gap_minutes`;
   - the lesson type (licence class, `requires_vehicle`, `requires_entitlement`).
2. In one transaction:
   1. `LedgerWriter.lockStudent(studentId)` (`pg_advisory_xact_lock`).
   2. Check the balance against `credit_minutes`:
      - Student and parent bookings require `balance >= credit_minutes`.
      - Staff bookings may go negative only if `allow_negative_balance`.
   3. Insert the lesson and a `debit` ledger entry. Consume the entitlement if the lesson type requires one.
   4. Append `LessonBooked`.
3. An exclusion-constraint violation returns `409 lesson_conflict` with the conflicting period (read under RLS).
4. A scheduling subscriber on `LessonBooked`/`LessonMoved` schedules BullMQ reminder jobs with deterministic ids (`<lessonId>:24h`, `<lessonId>:2h`), replacing earlier ones. When a job runs, it re-reads the lesson and sends only if it is still booked at the same period.

**Move**
- Same validation and lock as booking. If `credit_minutes` changes, record the difference as a `debit` or `restore`.
- Moving inside the cancellation window counts as a cancellation plus a new booking for students. Staff may move freely.
- Bumps `version` and appends `LessonMoved`.

**Cancel**
- Cancelled by a student or parent:
  - Before `cancellation_window_hours` (measured as elapsed hours to the lesson start): status `cancelled`, and a `restore` entry gives back the minutes.
  - Inside the window: `late_cancel = true` and no restore. Owner or office can override with an `adjustment`, which writes to `audit_log`.
- Cancelled by the instructor or school: always a full restore, and the student is notified.
- `LessonCancelled { late, byRole }` triggers fill-the-gap.

**Complete / no-show**
- The instructor marks `completed`, adds progress entries per syllabus item and an optional private note (a separate table, never exposed to students or parents).
- No-show is allowed only after the lesson starts. The minutes stay debited.

**Fill a gap**
- **Sources:**
  - `LessonCancelled` for a lesson more than 2 hours away;
  - a nightly job that scans the next 7 days for free availability of at least the shortest active lesson type;
  - a manual `POST /v1/slot-offers`.
- **Audience:**
  1. Waiting-list students whose preferred windows match, first come first served by `created_at`.
  2. If none match, active students with `balance >= credit_minutes` whose `area` equals the slot's area (the area of the previous or next lesson).
  - Students must also match the lesson type's licence class, and the instructor must be allowed for them (assigned, or the school allows any instructor).
- **Notification:** push, or email during quiet hours. No SMS. `expires_at = min(now + slot_offer_ttl_minutes, start − 2 h)`.
- **Accept** happens in one transaction:
  1. `UPDATE slot_offers SET status='taken' … WHERE id=$1 AND status='open' AND expires_at > now() AND $student = ANY(offered_to_student_ids)`.
  2. If no row is updated, return `409 offer_unavailable`.
  3. Otherwise run the normal booking steps with `booked_via = slot_offer`.
- A BullMQ job expires open offers.

**Buy a package or upsell**
1. `POST /v1/checkout {priceItemId}` with an `Idempotency-Key` creates a `pending` payment through `PaymentProvider.createCheckout` using the school's `school_payment_accounts.account_ref`. Checkout is disabled until that account is `active`.
2. On a verified `payment.succeeded` webhook (`POST /v1/webhooks/payments/{provider}`):
   1. Verify the signature.
   2. Look up the school with `billing_school_for_payment`.
   3. In a tenant transaction:
      - mark the payment `succeeded`;
      - add a `purchase` ledger entry (`credit_minutes`) and/or grant the entitlement;
      - issue the invoice (number from `invoice_counters` under row lock; tax and format per `InvoicePolicy`).
   4. Append `PaymentSucceeded` and `InvoiceIssued`.
   - Webhooks are idempotent on `(provider, provider_ref)`.

**Cash / bank transfer**
- Staff, or an instructor for cash, record the payment with `POST /v1/payments/cash`, which takes an `Idempotency-Key`. Same ledger, entitlement and invoice steps; `method = cash|bank_transfer`.

**Refund**
- Staff choose the amount and the `minutes_removed`.
  - The removed minutes may not exceed the current balance unless `allow_negative_balance` is set.
  - In-app payments are refunded through the provider; cash and bank refunds are only recorded.
- Creates a `refund` ledger entry and a credit note (a new invoice of kind `credit_note`, with its own number). The original invoice is never changed.

**Per-student fee**
- A school is charged once per student, at that student's **first** enrolment in the school.
  - Implemented as `StudentEnrolled` → billing subscriber → `platform_charges(kind=student_fee)`.
  - The unique index makes it idempotent.
  - Re-enrolments and extra courses are free.
- If the student is archived within 14 days of the charge and has no completed lessons, a `student_fee_reversal` with a negative amount is created.
- The amount comes from the school's plan at the time of the charge.

**Platform statement**
1. On the 1st of each month (02:00 UTC, `app_system`), a statement is created per school:
   - the base subscription (pro-rated for a partial first month; 0 for the solo plan);
   - plus pending charges for the previous month.
2. It is emailed to the owner (`PlatformStatementIssued`).
3. Phase 1 collection is by bank transfer or cash. A platform admin marks the statement paid with `{method, paidAt, reference?}`:
   - a bank transfer reference is required;
   - for cash, a receipt number is optional.
   Marking paid writes to `audit_log`. Partial payments are out of scope: the full total is paid or the statement stays `issued`.

**Monthly growth report**
- Runs per school at 03:00 local time on the 1st. It aggregates `rm_school_metrics_daily` for the previous calendar month in the school's time zone, writes `growth_reports` and notifies the owner.
- Metric definitions:

| Metric | Definition |
| --- | --- |
| `revenue_in_app_minor` | Succeeded in-app payments minus in-app refunds |
| `revenue_recorded_minor` | In-app plus cash/bank payments recorded, minus refunds |
| `inapp_share_bp` | `revenue_in_app / revenue_recorded` in basis points. Labelled "share of recorded revenue paid in the app", because unrecorded cash is unknown |
| `late_cancellations_kept`, `late_cancel_minutes_kept` | Late cancellations where the credit was kept (no override) |
| `no_show_rate_bp` and `no_show_rate_prev3m_bp` | No-shows ÷ lessons due, this month and the previous 3-month average. The report shows the trend; it does not claim "no-shows prevented" |
| `upsells_sold`, `upsell_revenue_minor` | Succeeded payments for `kind = upsell` price items |
| `slots_filled`, `slot_fill_minutes` | Accepted slot offers |

**Instructor offline sync**
- **Local queue.** The app stores its diary in SQLite and queues operations `{op_id, type, payload, base_version}`. Op types: `lesson.create`, `lesson.move`, `lesson.cancel`, `lesson.complete`, `lesson.no_show`, `progress.upsert`, `private_note.upsert`, `payment.cash`.
- **`POST /v1/sync {ops[]}`:**
  - Applies ops in order, each in its own savepoint. Each op is idempotent on `op_id` (`sync_operations` stores the result and replays it).
  - Lesson ops with `base_version` lower than the server's version are rejected with the server state.
  - Booking conflicts are rejected with `lesson_conflict` and the server state.
  - Progress and private notes use last-write-wins **in server arrival order**. The client timestamp is stored for display only.
- **`GET /v1/sync?cursor=`:**
  - Returns `change_feed` rows with `seq > cursor` that are either school-wide (`audience_membership_id is null`, e.g. vehicles) or addressed to this instructor, joined to current entity state.
  - `delete` and `revoke` rows tell the app to drop local data, e.g. when a student is unassigned.
  - The response returns the next cursor.

**Theory session**
- **Mock mode** draws questions per the pack's `exam_rules`: question count, per-category counts if given, and a time limit stored as `deadline_at`. Answers after the deadline are rejected. Finishing scores the session with the `ExamRules` adapter, which supports both "fraction of points" and "max error points with instant-fail questions".
- **Mistakes mode** draws questions whose latest answer by the student was wrong, matched across pack versions by `external_ref`.
- **Premium.** Students get practice mode and 3 mock exams per week. A `premium_theory` entitlement, or the school setting `theory_premium_free`, unlocks unlimited mocks and mistakes mode.

**Support access**
1. A platform admin calls `POST /v1/platform/support-sessions {schoolId, reason}`. The session lasts at most 60 minutes.
2. This returns a support token: read-only permissions, `app.school_id` set to that school, and normal RLS on `app_rw`.
3. Every request made in the session writes to `audit_log` with the session id. The school owner can see support sessions in their audit view.

**Student data export and deletion**
- **Export:** a JSON + PDF bundle of the student's record, lessons, progress (no private notes), payments and documents.
- **Deletion:** anonymizes the student and the user if they have no other membership. It clears name, contacts, date of birth, addresses and documents; keeps invoices, payments and ledger rows with a buyer snapshot (legal retention); and appends `StudentAnonymized`.

**Notifications and quiet hours**
- Quiet hours (`quiet_hours_start`–`quiet_hours_end`, school local time) apply to push and SMS. Email is never held.
- Each template has a timing rule:
  - **Deferred** (default: invitations, invoices, contracts, statements, growth report): sent at the end of quiet hours.
  - **Advanced** (lesson reminders): if the send time falls in quiet hours, send at the last minute before quiet hours start instead. A 2 h reminder for an 08:00 lesson goes out at 20:59 the evening before.
  - **Immediate** (cancellation of a lesson within the next 12 h, chat messages): sent at once, ignoring quiet hours.
  - **Email-only at night** (slot offers): push outside quiet hours, email inside them.
- A notification whose moment has passed (the lesson started or the offer expired) is marked `skipped`.

**Chat**
- Owner and office can read `student_instructor` conversations in their school, but cannot post in them. Participants see a notice that the school can read the chat.
- Messages older than `chat_retention_months` are deleted by a nightly job.
- Read state is tracked per member (`conversation_members.last_read_message_id`).

## 8. API (Phase 1)

| Module | Endpoints |
| --- | --- |
| identity | `POST /v1/auth/code`, `POST /v1/auth/verify`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`, `GET /v1/me`, `POST /v1/me/switch-school`, `POST /v1/invitations`, `GET /v1/invitations`, `POST /v1/invitations/{token}/accept`, `PATCH /v1/memberships/{id}` (roles, branches, grants, disable), `POST /v1/devices` |
| school | `GET/PATCH /v1/school`, `GET/PATCH /v1/school/settings`, `GET/PUT /v1/school/opening-hours`, `GET/POST/PATCH /v1/branches`, `GET/POST/PATCH /v1/vehicles`, `GET /v1/staff`, `POST /v1/school/payment-account` (connect, fake in dev) |
| school (enrolment page) | `GET/PUT /v1/school/public-profile`, `GET /v1/public/schools/{slug}` (public, no token), `POST /v1/reviews` (student, self), `GET /v1/reviews?status=`, `PATCH /v1/reviews/{id}` (approve/hide) |
| scheduling | `GET/POST/PATCH /v1/lesson-types`, `GET /v1/calendar?from&to&instructorId&vehicleId&studentId`, `GET /v1/calendar/free-slots?lessonTypeId&from&to&instructorId`, `GET/PUT /v1/instructors/{id}/availability`, `POST /v1/instructors/{id}/time-off`, `POST /v1/lessons`, `PATCH /v1/lessons/{id}` (move), `POST /v1/lessons/{id}/cancel`, `POST /v1/lessons/{id}/complete`, `POST /v1/lessons/{id}/no-show`, `GET /v1/sync`, `POST /v1/sync` |
| scheduling (offers) | `GET/POST /v1/waiting-list`, `DELETE /v1/waiting-list/{id}`, `GET /v1/slot-offers` (mine), `POST /v1/slot-offers`, `POST /v1/slot-offers/{id}/accept` |
| training | `GET/POST /v1/students`, `GET/PATCH /v1/students/{id}`, `GET/PUT /v1/students/{id}/instructors`, `POST /v1/students/{id}/enrolments`, `GET /v1/students/{id}/progress`, `POST /v1/students/{id}/test-attempts`, `POST /v1/students/{id}/guardians`, `POST /v1/guardians/{linkId}/consent`, `GET /v1/syllabus`, `POST /v1/students/{id}/export`, `POST /v1/students/{id}/archive`, `DELETE /v1/students/{id}` (anonymize) |
| training (leads) | `POST /v1/public/schools/{slug}/leads` (public, no token), `GET /v1/leads?status=&q=&cursor=&limit=`, `POST /v1/leads` (manual lead), `GET/PATCH /v1/leads/{id}` (status contacted/lost, note, lost reason), `POST /v1/leads/{id}/convert` |
| theory | `GET /v1/question-packs/current`, `POST /v1/theory/sessions`, `POST /v1/theory/sessions/{id}/answers`, `POST /v1/theory/sessions/{id}/finish`, `GET /v1/theory/mistakes`, `GET /v1/theory/stats` |
| billing | `GET/POST/PATCH /v1/price-items`, `GET /v1/shop`, `GET /v1/students/{id}/balance`, `GET /v1/students/{id}/ledger`, `POST /v1/checkout`, `GET /v1/invoices`, `GET /v1/invoices/{id}.pdf`, `POST /v1/refunds`, `POST /v1/payments/cash`, `POST /v1/ledger/adjustments`, `POST /v1/webhooks/payments/{provider}`, `GET /v1/platform-statements` (school's own) |
| documents | `POST /v1/documents/upload-url`, `POST /v1/documents/{id}/complete`, `GET /v1/documents`, `GET /v1/documents/{id}/download-url`, `GET/POST /v1/contract-templates`, `POST /v1/contracts`, `GET /v1/contracts/{id}`, `POST /v1/contracts/{id}/sign` |
| messaging | `GET /v1/conversations`, `GET/POST /v1/conversations/{id}/messages`, `POST /v1/conversations/{id}/read` |
| reporting | `GET /v1/reports/growth?month=`, `GET /v1/reports/no-shows`, `/revenue`, `/pass-rate`, `/utilisation` (all `?from&to`) |
| platform | `POST /v1/platform/schools`, `GET/POST/PATCH /v1/platform/plans`, `GET /v1/platform/statements`, `POST /v1/platform/statements/{id}/mark-paid` (`{method: bank_transfer|cash, paidAt, reference?}`), `POST /v1/platform/question-packs/import`, `POST /v1/platform/question-packs/{id}/publish`, `POST /v1/platform/support-sessions`, `POST /v1/platform/support-sessions/{id}/end`, `GET /v1/audit-log` (school owner: own school) |

Idempotency-Key is required on: `POST /v1/checkout`, `/v1/refunds`, `/v1/payments/cash`, `/v1/ledger/adjustments`, `/v1/lessons`, `/v1/slot-offers/{id}/accept` and `/v1/leads/{id}/convert`.

`GET /v1/me` also returns `active.features`, the feature slugs of the active school's plan (§2 Premium).

## 9. Adapters (`apps/api/src/adapters`)

| Interface | Dev implementation | Later |
| --- | --- | --- |
| `PaymentProvider` (connectAccount, createCheckout(accountRef, …), refund, verifyWebhook) | `FakePaymentProvider` with a local "pay" page and signed webhooks | Stripe Connect where available, or a local provider |
| `SmsSender` | logs to console | SMS API / local gateway |
| `PushSender` | logs to console | FCM + APNs via Expo push |
| `EmailSender` | Mailpit SMTP | transactional email service |
| `ObjectStorage` | MinIO (SSE enabled) | S3-compatible storage |
| `QuestionBankImporter` | JSON importer for `packs/*.json` | licensing authority's format |
| `InvoicePolicy` (number format per series, tax calculation, required seller/buyer fields, PDF render) | Generic EU-style: one series per year `YYYY-000001`, tax included in gross, simple PDF | Launch country's rules |
| `ExamRules` (draw, score, pass) | `fraction` (pass mark as fraction of points) and `error_points` (max error points, instant-fail questions) | Per country |

Question pack JSON (dev format):
```json
{ "country": "XX", "licenceClass": "B", "language": "en", "version": "2026.1",
  "exam": { "rules": "fraction", "questions": 30, "timeLimitMinutes": 45, "passMark": 0.85,
            "categories": { "signs": 10, "rules": 15, "safety": 5 } },
  "questions": [ { "ref": "1.1.01", "category": "signs", "body": "…", "media": null,
                   "answers": ["…","…","…"], "correct": [1], "points": 2, "explanation": "…" } ] }
```
For `"rules": "error_points"`, use `"maxErrorPoints"` instead of `"passMark"`, and give questions an optional `"instantFail": true`. Seed a small SAMPLE pack with made-up questions clearly marked as samples. Real content comes from the licensing authority.

## 10. Non-functional

- **Tenant isolation:** forced RLS, the `app_rw`/`app_system` split, a generic cross-tenant test for every route in CI, and tests for each `SECURITY DEFINER` function.
- **Security:**
  - TLS and encryption at rest.
  - Rate limits on auth endpoints (Redis).
  - Refresh-token rotation with reuse detection and a 30-second grace window.
  - Append-only audit log.
  - Webhook signature verification.
- **Privacy:** consent records (`guardian_links.consent_at`, `consent_text_version`), parental consent for minors before activation, per-student export and anonymization, chat retention.
- **Consistency:** read models are eventually consistent (target lag < 5 s at p95). Balance, clashes and invoices are always read from write tables.
- **Availability target:** 99.9% for the API. Daily backups with point-in-time recovery.
- **Localisation:** i18n keys everywhere (UI, notifications, PDFs), school currency and time zone, question packs per language.
- **Observability:**
  - Structured JSON logs with `school_id`, request id and event id.
  - Error tracking.
  - Alerts on dead letters, outbox lag over 60 s, webhook failures and sync backlog.

## 11. Decisions taken (defaults; change here before the affected workspace starts)

- **D1 Merchant of record.** Each school is the merchant for its students' payments. DriveOS never holds student money. `PaymentProvider` takes the school's connected account. Platform fees are billed to schools separately.
- **D2 Negative balances.** Students and parents can never book into a negative balance. Staff can only if `allow_negative_balance` is set (pay-later schools).
- **D3 Credit model.** There is a single pool of credit minutes per student. A lesson type sets its duration (`minutes`) and what it costs (`credit_minutes`); for example, a 45-minute night lesson can cost 60 credit minutes. Reporting is cash-basis, so the ledger carries no per-minute money value. Refunds of unused credit are an explicit staff decision (amount and minutes).
- **D4 Login identity.** Phone and email are unique per user. A student without their own phone or email has no login of their own. A guardian manages bookings and payments, and theory needs the student's own login.
- **D5 Chat safeguarding.** Owner and office can read instructor↔student chats. Participants are told this.
- **D6 Tax and invoices.** Phase 1 includes tax rates on price items, tax lines, seller and buyer snapshots, gapless numbering per series and credit notes, all behind `InvoicePolicy`. Country-specific e-invoicing waits for the launch country.
- **D7 Platform fee collection.** Monthly statement by email, paid by bank transfer or cash. A platform admin records the method and reference and marks it paid (audited). Card collection is Phase 2.
- **D8 Exam car.** "Car for the exam" is an `exam_car` entitlement consumed by booking a lesson type of `kind = exam`. That booking holds the vehicle and instructor through the normal exclusion constraints.
- **D9 Premium theory.** It unlocks unlimited mock exams and mistakes mode. A school can make it free for all its students with `theory_premium_free`.
- **D10 Support access.** It is read-only, time-boxed, audited and runs under normal RLS. It never uses `BYPASSRLS`.
- **D11 Plan feature gating.** A premium feature is a slug in `plans.features`; a school has it when its current subscription's plan lists it (`platform.SchoolHasFeatureQuery`, no per-school overrides). The API enforces `enrolment_page`: the public page and the public enquiry form answer `404 school_not_found` exactly like an unpublished page, and saving the public profile with `published: true` or adding a manual lead (`POST /v1/leads`) answers `403 feature_not_in_plan`. Existing leads and reviews stay readable, editable and convertible after a downgrade, so a school never loses data. The admin app hides the Leads navigation item from `GET /v1/me` `active.features` and shows an upgrade notice in the Public page settings.
- **D12 Public lead route security.** The public routes carry no token and never take a school id from the client: the API first resolves the slug with `school_id_for_public_slug` in a school-less scope (published profile, active school), checks the plan feature, and only then runs the command inside that school's tenant transaction (`app.user_id` empty) under RLS. Abuse controls: a hidden `website` honeypot (a filled one gets `201 { id }` with a throw-away id and nothing is written, so a bot cannot tell), the rate limits `public-page` (120 per IP per hour) and `leads` (10 per IP per hour), and a 30-day dedupe (same phone or email and not `lost` → the message is appended to the existing lead's note). There is no per-contact rate limit. The IP is stored only as a SHA-256 hash and nulled after 30 days. Consent: the page shows the consent text whose version the API sends (`consentTextVersion`, now `lead-consent.v1`); the version and time are stored with the lead, and a minor's enquiry needs a guardian name and contact (CHECK). Leads typed in by staff store the version `manual`. Closed (`lost`/`converted`) leads are deleted 12 months after closing (`training.lead-purge`); anonymizing a student deletes the lead linked to them, and the student export lists it.
- **D13 Reviews.** Only a student with a passed practical test (`HasPassedPracticalQuery`) can submit, once (`409 review_exists`); others get `403 review_not_available`. DriveOS asks every student who passes, once (`review_request`, dedupe key per student), never only the happy ones. A review starts `pending`; the school approves or hides it, and the moderation screen says hiding is the school's choice. Only approved reviews are public (newest 20 plus count and average), shown as first name + last initial fixed at submit. Anonymizing a student deletes their review (`school.review-anonymizer` on `StudentAnonymized`). The app's review deep link carries no external URL; the school's external review link appears only in the `review_request` email and on the public page.

## 12. Open decisions (keep pluggable until decided)

- Launch country, its official question-bank source and format, invoice rules and e-invoicing.
- Payment provider available in the launch country.
- SMS provider and sender ID rules.
- Exam languages required at launch.
- Age of majority and digital-consent age per launch country (defaults: 18 for majority; consent stored per guardian link).
- Product name (DriveOS is a working name).
