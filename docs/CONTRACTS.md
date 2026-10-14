# DriveOS contracts

What each API module exposes to the others, and how the frontends mock the API until the
real handlers exist. The source of truth is each module's `apps/api/src/modules/<module>/index.ts`
(public commands, queries and same-transaction services), `packages/shared/src/events` (event
payloads, each a zod schema with an integer `version`) and `packages/shared/src/dto` (HTTP request
and response schemas). `apps/api/test/contracts/contracts-doc.test.ts` fails when a public class in
an `index.ts` is missing here, or when this file names a command or query that does not exist.

Modules talk to each other only through the `CommandBus`/`QueryBus` with the classes below,
through events (outbox, handled in the worker), or through the same-transaction services.
Never import another module's tables, repositories or internal files.

## Same-transaction services

They join the caller's tenant transaction (SPEC §3.4). Inject them by token or class.

- **billing** `LEDGER_WRITER` → `LedgerWriter`. Fake: `apps/api/test/fakes/in-memory-ledger-writer.ts`
  (`InMemoryLedgerWriter`).
  - `lockStudent(studentId): Promise<void>` takes the per-student ledger lock; call it before `balance`.
  - `balance(studentId): Promise<number>` sums signed minutes; balances are never stored.
  - `debit({ studentId, minutes, lessonId, note?, createdByMembershipId? })`
  - `restore({ studentId, minutes, lessonId, createdByMembershipId? })`
  - `credit({ studentId, minutes, paymentId, priceItemId })`
  - `adjust({ studentId, minutes, note, createdByMembershipId, lessonId? })`
  - `refund({ studentId, minutes, refundId, paymentId?, createdByMembershipId? })` (entry type `refund`,
    negative minutes; used by billing's refunds)
  - each write returns `Promise<{ entryId, balanceAfter }>`, takes the student lock itself (re-entrant
    within the transaction) and appends `LedgerEntryRecorded` (aggregate `student_ledger`, id = student
    id, version = number of entries). It does not apply the non-negative rule: callers lock, read
    `balance`, decide, then write.
- **platform** `AUDIT_WRITER` → `AuditWriter`. Fake: `apps/api/test/fakes/in-memory-audit-writer.ts`
  (`InMemoryAuditWriter`).
  - `record({ action, targetType, targetId, reason? }): Promise<void>`; school, actor and support
    session come from the tenant context.
- **identity** `MembershipDirectory` (class, tenant-scoped reads of memberships):
  `getMembership(id)`, `findByUser(userId)`, `listByRole(role)`, `userIdOf(membershipId)`,
  `hasRole(membershipId, role)`, `listStaff()`, `contactsOf(userIds)` (name, phone and email of
  users who are members of the current school), `localesOf(userIds)` (their `users.locale`).

## Kernel: rate limits and alerts

- **Rate limits** (`apps/api/src/kernel/http/rate-limit.{decorator,guard,module}.ts`, Redis fixed
  windows: `INCR` + `EXPIRE NX` on `<JOBS_PREFIX>:ratelimit:<name>:…`). Put
  `@RateLimit({ name, keyBy, limit?, windowSeconds? })` on every `@Public()` route (class or
  method; several rules may stack). `name` picks a policy whose limit and window come from env
  (`RATE_LIMIT_<NAME>_LIMIT`, `RATE_LIMIT_<NAME>_WINDOW_SECONDS`); `keyBy` is `ip`, `ip+route`
  (method and route path) or `contact` (HMAC of the lower-cased `body.contact`; no contact, no
  count). Over the limit: `429 rate_limited` with `Retry-After` and
  `details.retryAfterSeconds`. Policies: `auth` (ip+route on `/v1/auth/*`), `auth-contact`
  (contact on `POST /v1/auth/verify`), `invitations` (`POST /v1/invitations/{token}/accept`),
  `webhooks` (`POST /v1/webhooks/payments/{provider}`), `fake-pay`, `health`, `public-page`
  (`GET /v1/public/schools/{slug}`), `leads` (ip+route on `POST /v1/public/schools/{slug}/leads`,
  10 per hour). Identity's silent
  per-contact/per-IP/per-prefix OTP limits on `POST /v1/auth/code` stay in
  `identity/infra/login-rate-limiter.ts` (always `202`). Client IPs follow Express
  `trust proxy` = `HTTP_TRUST_PROXY` (default `loopback`; set it to the load balancer's
  addresses in production). `RATE_LIMIT_ENABLED=false` turns the guard off (the API test suite
  does this; `test/http/rate-limit.test.ts` turns it on). `test/http/rate-limit.test.ts` fails when a
  `@Public()` route has no rule or a non-public route has one. The guard counts on
  `RedisConnection.failFastClient` (one retry, 250 ms command timeout; BullMQ keeps the patient
  `client`): when Redis is unreachable the check is skipped (fail open) and one `warn`
  `rate limit check skipped: redis unavailable` is logged per outage.
- **Logging** (`apps/api/src/kernel/logging`). The HTTP request line carries `reqId` and, once the
  `AuthGuard` has run, `schoolId` and `userId` from the access token (nothing else from the
  principal, never phone or email). `withLogContext(fields, fn)` (`log-context.ts`) adds fields to
  every pino line written inside `fn` (pino `mixin`); `EventDelivery` wraps each delivery in
  `{ eventId, eventType, subscriber, schoolId }`, so subscriber and projection logs carry the event.
  The console SMS adapter logs the phone and body only outside production.
- **Config** (`kernel/config/env.ts`): `OPENAPI_UI_ENABLED` (default on outside production, off in
  production; `openApiUiEnabled(env)`) gates Swagger UI `/docs` and `/docs-json`; `pnpm generate`
  builds the document directly and does not depend on it. `API_PUBLIC_URL` (default
  `http://localhost:${API_PORT}`, `apiPublicUrl(env)`) is the base of the fake payment provider's
  checkout links.
- **Alerts** (`apps/api/src/kernel/alerts`, worker only). `AlertProbes.register({ name,
  threshold, measure(now) → { value, schoolId } })` from a module's worker provider; an alert
  fires while `value > threshold`. The scheduled job `platform.alerts` (every
  `ALERTS_INTERVAL_MS`, default 60 s, `app_system` through `TenantContext.runAsSystem`) runs
  every probe, logs one warn `{ alert, value, threshold, schoolId, state: raised|cleared }` per
  state change and stores `{ items, evaluatedAt }` in Redis `<JOBS_PREFIX>:alerts:current`
  (`AlertStore`). Probes:
  - `dead_letters` (kernel): rows in `dead_letters` (`ALERT_DEAD_LETTERS_THRESHOLD`, default 0);
    delete or replay the row to clear it.
  - `outbox_lag` (kernel): age in seconds of the oldest unpublished outbox row
    (`ALERT_OUTBOX_LAG_SECONDS`, default 60).
  - `webhook_failures` (billing): rejected or failed payment webhooks recorded in
    `payment_webhook_failures` within `ALERT_WEBHOOK_FAILURES_WINDOW_SECONDS` (default 900),
    alert above `ALERT_WEBHOOK_FAILURES_THRESHOLD` (default 0); counted as `app_rw` in a
    school-less scope through `billing_count_webhook_failures` (migration 0026).
  - `sync_backlog` (scheduling): age in seconds of the oldest outbox event (last 24 h) of a type
    that `scheduling.change-feed` consumes and that has neither an `event_deliveries` nor a
    `dead_letters` row for it (`ALERT_SYNC_BACKLOG_SECONDS`, default 60). This measures what
    `GET /v1/sync` is missing; `sync_operations` growth is not used because pushes apply
    synchronously.
  - `GET /v1/platform/alerts` (`platform.manage`) returns the stored set
    (`PlatformAlertListResponse`).

## Modules

A module's `index.ts` exports contracts only: commands, queries, DI tokens and their interfaces,
and the same-transaction services. It never re-exports a Nest `*Module` / `*WorkerModule` class:
`app.module.ts`, `worker.module.ts` and any module that lists another in `imports:` import the class
from `../<module>/<module>.module.js` (or `<module>-worker.module.js`). Contract files
(`*.command.ts`, `*.query.ts`, token files) never import handlers, controllers or module files, so
there are no ESM cycles and no `forwardRef`. `apps/api/test/architecture/module-boundaries.test.ts`
enforces all three rules. The Nest classes named below live in those `*.module.ts` files.

### Event consumers

SPEC §3.6 with every worker subscriber and projection as built (subscriber name → events). All are
idempotent by event id (`event_deliveries`); projections also skip stale `aggregate_version`s.

| Module | Emits | Consumes |
| --- | --- | --- |
| identity | `InvitationCreated`, `MembershipCreated`, `MembershipRolesChanged`, `MembershipPermissionsChanged`, `MembershipDisabled` | `identity.permission-cache` ← `MembershipPermissionsChanged`; `identity.guardian-consent` ← `GuardianConsentGiven`; `identity.device-token-pruning` ← `DeviceTokenInvalidated` |
| school | `SchoolCreated`, `SchoolSettingsChanged`, `BranchChanged`, `VehicleChanged`, `PaymentAccountConnected`, `ReviewSubmitted`, `ReviewModerated` | `school.review-anonymizer` ← `StudentAnonymized` |
| platform | `SupportSessionStarted`, `SupportSessionEnded`, `SubscriptionChanged` | — |
| scheduling | `LessonBooked`, `LessonMoved`, `LessonCancelled`, `LessonCompleted`, `LessonMarkedNoShow`, `AvailabilityChanged`, `TimeOffAdded`, `WaitingListJoined`, `SlotOfferCreated`, `SlotOfferAccepted`, `SlotOfferExpired` | `scheduling.change-feed` ← `LessonBooked`, `LessonMoved`, `LessonCancelled`, `LessonCompleted`, `LessonMarkedNoShow`, `StudentCreated`, `StudentEnrolled`, `StudentArchived`, `StudentAnonymized`, `InstructorAssigned`, `InstructorUnassigned`, `ProgressRecorded`, `VehicleChanged`, `AvailabilityChanged`, `TimeOffAdded`; `scheduling.lesson-reminders` ← `LessonBooked`, `LessonMoved`, `LessonCancelled`; `scheduling.slot-offers-from-cancellations` ← `LessonCancelled` |
| training | `StudentCreated`, `StudentEnrolled`, `StudentArchived`, `StudentAnonymized`, `GuardianLinked`, `GuardianConsentGiven`, `InstructorAssigned`, `InstructorUnassigned`, `ProgressRecorded`, `TestAttemptRecorded`, `LeadCaptured`, `LeadStatusChanged`, `LeadConverted` | `training.membership-student-link` ← `MembershipCreated`, `MembershipRolesChanged`; `training.student-list` ← `StudentCreated`, `StudentEnrolled`, `StudentArchived`, `StudentAnonymized`, `InstructorAssigned`, `InstructorUnassigned`, `ProgressRecorded`, `TestAttemptRecorded`, `LedgerEntryRecorded`, `LessonBooked`, `LessonMoved`, `LessonCancelled`, `LessonCompleted`, `LessonMarkedNoShow` |
| theory | `QuestionPackPublished`, `TheorySessionFinished` | — |
| billing | `PaymentSucceeded`, `PaymentFailed`, `CashPaymentRecorded`, `RefundIssued`, `LedgerEntryRecorded`, `EntitlementGranted`, `InvoiceIssued`, `CreditNoteIssued`, `PlatformChargeCreated`, `PlatformStatementIssued` | `billing.student-fee` ← `StudentEnrolled`; `billing.student-fee-reversal` ← `StudentArchived` |
| documents | `DocumentUploaded`, `ContractCreated`, `ContractSigned`, `ContractCompleted` | `documents.student-anonymized` ← `StudentAnonymized` |
| messaging | `MessageSent`, `DeviceTokenInvalidated` | `messaging.conversations` ← `StudentCreated`, `InstructorAssigned`; `messaging.invitation-notifications` ← `InvitationCreated`; `messaging.lesson-notifications` ← `LessonBooked`, `LessonMoved`, `LessonCancelled`; `messaging.billing-notifications` ← `InvoiceIssued`, `PlatformStatementIssued`; `messaging.contract-notifications` ← `ContractCreated`; `messaging.chat-notifications` ← `MessageSent`; `messaging.slot-offer-notifications` ← `SlotOfferCreated`; `messaging.growth-report-notifications` ← `GrowthReportGenerated`; `messaging.guardian-consent-notifications` ← `GuardianLinked` |
| reporting | `GrowthReportGenerated` | `reporting.school-metrics` ← `LessonBooked`, `LessonMoved`, `LessonCancelled`, `LessonCompleted`, `LessonMarkedNoShow`, `SlotOfferCreated`, `SlotOfferAccepted`, `SlotOfferExpired`, `PaymentSucceeded`, `CashPaymentRecorded`, `RefundIssued`, `TestAttemptRecorded`, `AvailabilityChanged`, `TimeOffAdded` |

Differences from the SPEC §3.6 table: messaging also emits `DeviceTokenInvalidated` (consumed by
identity); training's `GuardianLinked` is consumed by messaging (consent request); scheduling does
not subscribe to `InstructorUnassigned` beyond `change_feed`; nothing consumes `TheorySessionFinished`,
`QuestionPackPublished`, `PaymentFailed`, `EntitlementGranted`, `CreditNoteIssued`,
`PlatformChargeCreated`, `WaitingListJoined`, `DocumentUploaded`, `ContractSigned`,
`ContractCompleted`, `SchoolCreated`,
`SchoolSettingsChanged`, `BranchChanged`, `PaymentAccountConnected`, `ReviewSubmitted`,
`ReviewModerated`, `LeadCaptured`, `LeadStatusChanged`, `LeadConverted` or the platform events yet
(reporting and messaging consume the lead events from enrolment page tasks 6 and 7). The school module also consumes training's
`StudentAnonymized` (enrolment page design §4.3).

### identity (owned by step 3a)

- Nest: `IdentityModule`, `IdentityWorkerModule`; service `MembershipDirectory`.
- Commands: `RequestLoginCodeCommand`, `VerifyLoginCodeCommand`, `RefreshSessionCommand`,
  `RevokeSessionCommand`, `SwitchSchoolCommand`, `RegisterDeviceCommand`, `CreateInvitationCommand`,
  `AcceptInvitationCommand`, `UpdateMembershipCommand`, `InviteOwnerCommand` (platform onboarding
  only: the actor must hold `platform.manage`; the only way to invite an `owner`),
  `AnonymizeUserCommand(userId) → { userAnonymized }` (training's student deletion: disables the
  user's student-only membership in the current school (`MembershipDisabled`, sessions revoked) and
  clears the user's name, phone and email only when `auth_memberships_for_user` shows no other
  membership; a membership with other roles is left alone).
- Queries: `GetMeQuery` (`GET /v1/me`; `active` also carries `grants`, the sorted effective
  permission set = role permissions + the membership's `permission_grants`, and `studentId`, the
  caller's student record in the active school via training `GetStudentByUserQuery` when the roles
  include `student`, else null, and `features`, the active school's plan features via platform
  `GetCurrentSubscriptionQuery`; empty for a school other than the tenant's), `ListInvitationsQuery(limit, cursor?, { studentId?, role? })`
  (`GET /v1/invitations?studentId=&role=`, open invitations, newest first, cursor = invitation id;
  `role` matches any role of the invitation), `ListDevicesForUsersQuery(userIds) → { id,
  userId, pushToken, platform, locale }[]` (registered in the API and the worker; a school scope reads the
  devices of that school's members through the `auth_devices_for_school_members` SECURITY DEFINER
  function, migration 0026).
- Emits: `InvitationCreated`, `MembershipCreated`, `MembershipRolesChanged`,
  `MembershipPermissionsChanged`, `MembershipDisabled`.
- Consumes: `MembershipPermissionsChanged` (permission cache), `GuardianConsentGiven` (activates the
  minor's membership), `DeviceTokenInvalidated` (worker subscriber `identity.device-token-pruning`:
  deletes the device row when `id` and `userId` match and `last_seen_at <= occurredAt`, so a device
  that re-registered since is kept; idempotent by event id. The delete goes through the
  `auth_prune_device` SECURITY DEFINER function (migration 0026), which acts only in a worker scope
  without `app.user_id` and only on devices of members of the current school).

### school

- Nest: `SchoolModule`, `SchoolWorkerModule`.
- Commands: `ProvisionSchoolCommand`, `UpdateSchoolCommand`, `UpdateSchoolSettingsCommand`,
  `ReplaceOpeningHoursCommand`, `CreateBranchCommand`, `UpdateBranchCommand`, `CreateVehicleCommand`,
  `UpdateVehicleCommand`, `ConnectPaymentAccountCommand`.
- Enrolment page commands: `UpdatePublicProfileCommand(actor, body) → { id: schoolId, version }`
  (`PUT /v1/school/public-profile`, `public_page.manage`; creates the profile on first save, which
  needs `slug`, else changes only the given fields; slug rules in `domain/slug.ts` → `400
  validation_error`; another school's slug → `409 slug_taken`; publishing, or saving while
  published, without the `enrolment_page` plan feature → `403 feature_not_in_plan`; no event),
  `SubmitReviewCommand(actor, body) → { id, version: 1 }` (`POST /v1/reviews`, `reviews.submit`;
  the student is training `GetStudentByUserQuery(actor.userId)`, `404` without one; training
  `HasPassedPracticalQuery` false → `403 review_not_available`; second review → `409 review_exists`;
  `displayName` = first name + last initial, fixed at submit), `ModerateReviewCommand(actor,
  reviewId, { status: approved | hidden })` (`PATCH /v1/reviews/{id}`, `reviews.moderate`),
  `DeleteStudentReviewCommand(studentId) → void` (deletes the student's review; used by the worker
  subscriber `school.review-anonymizer` ← `StudentAnonymized`; registered in the API and the
  worker).
- Queries: `GetSchoolQuery`, `GetSchoolSettingsQuery`, `GetOpeningHoursQuery`, `GetPaymentAccountQuery`,
  `ListBranchesQuery`, `GetMissingBranchIdsQuery` (ids that are not branches of the current school),
  `GetVehicleQuery`, `ListVehiclesQuery`, `ListStaffQuery`.
- Enrolment page queries: `GetPublicProfileQuery → PublicProfile | null` (current school; registered
  in the API and the worker; `GET /v1/school/public-profile` answers `404` while it is null),
  `ListReviewsQuery({ status?, cursor?, limit })` (`GET /v1/reviews`, `reviews.moderate`, newest
  first, cursor = review id), `ResolvePublicSchoolQuery(slug) → schoolId` (**execute it in a
  school-less scope**, `runInTenant({ schoolId: null, userId: null })`: it calls the SECURITY
  DEFINER function `school_id_for_public_slug(slug text) returns uuid` (migration 0030; published
  profile of an `active` school only), then checks platform `SchoolHasFeatureQuery('enrolment_page')`
  inside `enterSchool`; unknown, unpublished, inactive or no feature → `404 school_not_found`; the
  public lead route reuses it), `GetPublicSchoolPageQuery → PublicSchoolPage` (run in
  `runInTenant({ schoolId, userId: null })` after resolving; composes the profile, school, branches
  with opening hours (own hours, else school-wide), billing `ListPublicPriceItemsQuery` when
  `showPrices`, active instructors' names via `MembershipDirectory` when `showInstructors`, the
  newest 20 approved reviews with count and average (`averageRatingTenths`), the distinct licence
  classes of active lesson types via scheduling `ListLessonTypesQuery` (`['B']` when there are
  none), and
  `consentTextVersion = LEAD_CONSENT_TEXT_VERSION` (`lead-consent.v1`)).
- Public route: `GET /v1/public/schools/{slug}` (`@Public()`, rate limit `public-page` 120 per IP
  per hour, `Cache-Control: public, max-age=60`); `PublicSchoolController` → `PublicPages.render`
  (`infra/public-pages.ts`: `ResolvePublicSchoolQuery` in a school-less transaction, then
  `GetPublicSchoolPageQuery` in the school's).
- Emits: `SchoolCreated`, `SchoolSettingsChanged`, `BranchChanged`, `VehicleChanged`,
  `PaymentAccountConnected`, `ReviewSubmitted` v1 `{ reviewId, studentId, rating, submittedAt }`,
  `ReviewModerated` v1 `{ reviewId, status, moderatedAt }` (aggregate `school_review`, id = review
  id).
- Consumes: `StudentAnonymized` (worker subscriber `school.review-anonymizer`: deletes the student's
  review; idempotent).

### platform

- Nest: `PlatformModule`; service `AUDIT_WRITER`.
- Commands: `CreateSchoolCommand`, `CreatePlanCommand`, `UpdatePlanCommand`,
  `StartSupportSessionCommand`, `EndSupportSessionCommand`.
- Queries: `ListPlansQuery`, `GetCurrentSubscriptionQuery` (carries the plan's `features`),
  `SchoolHasFeatureQuery(feature) → boolean` (true when the school's active plan lists the feature;
  false without a subscription; `PLAN_FEATURES` = `enrolment_page`), `ListAuditLogQuery`. The plan
  DTO and the create/update plan requests carry `features` (`text[]`, default empty).
- Emits: `SupportSessionStarted`, `SupportSessionEnded`, `SubscriptionChanged`.
- Worker: `PlatformWorkerModule` registers `GetCurrentSubscriptionQuery` in the worker.
- Uses: theory `ImportQuestionPackCommand`, `PublishQuestionPackCommand` (the
  `/v1/platform/question-packs/*` routes live in `PlatformController`).

### scheduling

- Nest: `SchedulingModule`.
- Commands: `CreateLessonTypeCommand`, `UpdateLessonTypeCommand`, `ReplaceAvailabilityCommand`,
  `AddTimeOffCommand`, `BookLessonCommand`, `MoveLessonCommand`, `CancelLessonCommand`,
  `CompleteLessonCommand`, `MarkNoShowCommand`, `ApplySyncOperationsCommand`, `JoinWaitingListCommand`,
  `LeaveWaitingListCommand`, `CreateSlotOfferCommand`, `AcceptSlotOfferCommand`.
- Queries: `ListLessonTypesQuery`, `GetLessonTypeQuery`, `GetLessonQuery`, `GetCalendarQuery`,
  `ListFreeSlotsQuery`, `GetAvailabilityQuery`, `ListSyncChangesQuery`, `ListWaitingListQuery`,
  `ListSlotOffersQuery`, `HasCompletedLessonsQuery`, `CountCompletedLessonsQuery` (training's
  `StudentArchived.completedLessons`), `ListStudentIdsWithLessonsQuery` (training's "instructor sees
  student" rule: lessons since a given instant, future included).
- Emits: `LessonBooked`, `LessonMoved`, `LessonCancelled`, `LessonCompleted`, `LessonMarkedNoShow`,
  `AvailabilityChanged`, `TimeOffAdded`, `WaitingListJoined`, `SlotOfferCreated`, `SlotOfferAccepted`,
  `SlotOfferExpired`.
- Lesson types: `kind = exam` requires `requiresEntitlement = exam_car` (400 otherwise, D8).
  `PUT /v1/instructors/{id}/availability` replaces the weekly pattern for
  `[effectiveFrom, effectiveTo ?? open]` (rows before are closed the day before, an outlasting row
  resumes the day after `effectiveTo`); `AvailabilityChanged` (aggregate `availability`, id = the
  instructor membership, version from `availability_versions`) carries `effectiveTo` when given.
  Time off never cancels lessons; overlapping time off → `409 time_off_overlap`.
  `GET /v1/calendar` also returns the range's `availability` windows and `timeOff` (staff scopes
  only; students and parents get empty arrays).
  `POST /v1/lessons` (`BookLessonCommand(actor, body, lessonId?, bookedVia?)`, `bookedVia` defaults
  from the actor: owner/office → `office`, instructor, student, parent): `lessons.create` books any
  active student with any active instructor; `lessons.create.own` lets an instructor book an
  assigned student into their own diary, a student book themself and a parent book a consented
  linked student, both only with an assigned instructor (any active one when none is assigned);
  otherwise `403`. Errors: `404` unknown student / inactive or unknown lesson type, vehicle or
  instructor; `409 student_not_active`; `400 validation_error` (start not on a whole minute,
  vehicle missing for `requiresVehicle`, no pickup in the body or the student record);
  `409 slot_unavailable` with `details.reason` `in_past | licence_class | vehicle_licence_class |
  outside_availability | min_gap` (overlaps are left to the constraints); `409 insufficient_balance`
  (students/parents never go negative, staff only with `allowNegativeBalance`);
  `409 entitlement_missing` (exam types); `409 lesson_conflict` with
  `details { start, end, lessonId? }` of the conflicting booked/completed lesson.
  `POST /v1/lessons/{id}/cancel` (`CancelLessonCommand(actor, lessonId, body)`, body
  `{ reason?, version?, restoreCredit? }`, returns `{ id, version, late, minutesRestored }`):
  `lessons.cancel` cancels any lesson (`byRole` owner/office); `lessons.cancel.own` lets an
  instructor cancel a lesson in their own diary, a student their own lesson and a parent a
  consented linked student's lesson. A lesson the caller cannot see → `404`; seen through
  `calendar.read` but not cancellable → `403`. Student/parent: before `cancellationWindowHours`
  (elapsed time to the start ≥ the window; the boundary counts as before) → `late = false`, full
  restore; inside → `late = true`, no restore; sending `restoreCredit` → `400 validation_error`.
  Staff (owner/office/instructor) → always `late = false` with a full restore, except that
  owner/office may send `restoreCredit: false` inside the window to record the student's late
  cancellation (`late = true`, no restore, `audit_log` action `lesson.late_cancel_kept`, reason =
  the body reason); `restoreCredit: false` outside the window or from an instructor → `400`.
  Errors: `409 lesson_not_booked` (status is not `booked`), `409 version_conflict` with
  `details.serverVersion` = the current `LessonResponse` (stale `version`). Exam-car lessons release
  the `exam_car` entitlement on every cancel (late or not), so the student can book another exam.
  `LessonCancelled { …, late, byRole, minutesRestored, cancelledByMembershipId, reason? }` is
  appended with the new lesson version.
- Complete / no-show: `POST /v1/lessons/{id}/complete` (`CompleteLessonCommand(actor, lessonId,
  body)`, body `{ progress = [], privateNote?, version? }`) and `POST /v1/lessons/{id}/no-show`
  (`MarkNoShowCommand(actor, lessonId, body)`, body `{ version? }`) both return
  `CommandResult { id, version }` and are not idempotency-keyed. `lessons.complete` records any
  lesson; `lessons.complete.own` only a lesson in the instructor's own diary. Students and parents →
  `403`; a lesson the caller cannot see → `404` (seen through `calendar.read` → `403`). Both need
  status `booked` (`409 lesson_not_booked`), a matching `version` when sent (`409 version_conflict`
  with `details.serverVersion`) and a lesson that has started (start ≤ now, else
  `409 lesson_not_started`). They set `status = completed | no_show`, bump `version` and append
  `LessonCompleted` / `LessonMarkedNoShow { …, markedByMembershipId }` with the new version. The
  minutes stay debited (no ledger write, exam-car entitlement stays consumed). Complete then runs
  training's `RecordProgressCommand` (when `progress` is not empty) and `UpsertPrivateNoteCommand`
  (when `privateNote` is sent) with the same actor in the same transaction; their errors (e.g.
  `400` unknown syllabus item) roll the completion back.
- Public queries (module-internal, run under the caller's RLS, no permission check):
  `GetLessonQuery(lessonId)` → `LessonResponse | null`; `ListStudentIdsWithLessonsQuery(
  instructorMembershipId, since)` → distinct student ids with a not-cancelled lesson of that
  instructor starting at or after `since`; `CountCompletedLessonsQuery(studentId)` → number of
  `completed` lessons; `HasCompletedLessonsQuery(studentId)` → whether that number is > 0.
- Move: `PATCH /v1/lessons/{id}` (`MoveLessonCommand(actor, lessonId, body)`, body
  `MoveLessonRequest`, not idempotency-keyed) returns `CommandResult { id, version }`; the row is
  updated in place (same id, `version + 1`). The request is merged over the current lesson and the
  target is validated exactly like a booking (`slot_unavailable`, `lesson_conflict` with the other
  lesson's period, min gap ignoring the moved lesson itself). `lessons.move` moves any lesson,
  including to another instructor or vehicle; `lessons.move.own` lets an instructor move lessons in
  their own diary but not hand them to another instructor (`403`). Students and parents do not hold
  `lessons.move.own` in the role map; with a `permission_grants` grant they may move their own
  lesson (instructor rules as for booking). A type change (how the admin resizes a lesson; the
  duration becomes the new type's `minutes`) is allowed only when `requiresEntitlement` is the same
  for both types, else `400 validation_error` on `lessonTypeId`. Credit: `delta = new − old
  creditMinutes`; `delta > 0` is a `debit` after the booking balance check (`409
  insufficient_balance`), `delta < 0` a `restore`. A student/parent moving a lesson whose original
  start is inside the cancellation window (any change of time, instructor, vehicle or type) counts as
  a late cancellation plus a new booking: the old debit stays and the new credit is debited in full.
  Errors as for cancel (`lesson_not_booked`, `version_conflict`). `LessonMoved { …, previousStart,
  previousEnd, previousInstructorMembershipId, previousVehicleId, creditMinutesDelta,
  lateCancellation?, movedByMembershipId }`: `creditMinutesDelta` is the net minutes charged by
  this move (`0` unchanged, negative = restored, the full new credit for a late move).
- Uses: `LEDGER_WRITER` (debit on booking, restore on cancel unless late, debit/restore of the delta
  on move), `ConsumeEntitlementCommand` /
  `ReleaseEntitlementCommand` (exam car), `GetStudentBookingProfileQuery`, `GetStudentByUserQuery`,
  `ListLinkedStudentIdsQuery`, `ListStudentNamesQuery`, school's `GetSchoolQuery`,
  `GetSchoolSettingsQuery`, `GetOpeningHoursQuery`, `ListVehiclesQuery`, `RecordProgressCommand`
  and `UpsertPrivateNoteCommand` (lesson completion).
- Reminders (worker): subscriber `scheduling.lesson-reminders` consumes `LessonBooked`,
  `LessonMoved`, `LessonCancelled`. It reads the current lesson row (so a stale or replayed event
  never reschedules to an old time): not `booked` → remove both jobs; `booked` → replace the BullMQ
  jobs `<lessonId>/24h` and `<lessonId>/2h` on queue `reminders` (SPEC writes `<lessonId>:24h`;
  BullMQ rejects `:` in custom ids). Each job is delayed until messaging's
  `PlanNotificationMomentQuery({ timing: 'advanced', sendAt: start − 24 h | − 2 h })`, so a 2 h
  reminder for an 08:00 lesson runs at 20:59 the evening before; a moment already passed is skipped.
  Job data `{ schoolId, lessonId, kind: '24h' | '2h', start }` (zod). The processor (registered with
  the kernel `JobProcessors`, started by the worker lifecycle) opens the school's tenant scope,
  re-reads `GetLessonQuery` and sends only if the lesson is still `booked` at the same `start`:
  `SendNotificationCommand({ recipients: { userIds: student user + guardians from
  GetStudentRecipientsQuery }, template: 'lesson_reminder', payload { lessonId, start,
  instructorName }, timing: 'advanced', sendAt: nominal moment, skipAfter: start, dedupeKey:
  '<lessonId>/<kind>/<start ISO>' })`. The start in the key lets a moved lesson be reminded again
  despite the per-(school, user, channel) unique dedupe index. Uses `PlanNotificationMomentQuery`,
  `SendNotificationCommand`, `GetStudentRecipientsQuery`. A job that is running cannot be removed or
  replaced; then `ReminderJobs.schedule` throws `ReminderJobBusyError`, the subscriber delivery
  fails, its `event_deliveries` claim rolls back and the events queue retries the same event with
  its backoff (`EVENT_BACKOFF_DELAY_MS`), by which time the old job has finished. Because the
  subscriber reads the current lesson row, the retry (and any stale event) converges on the latest
  start.
- Waiting list: `GET/POST /v1/waiting-list`, `DELETE /v1/waiting-list/{id}`
  (`ListWaitingListQuery(actor, params)`, `JoinWaitingListCommand(actor, body)` →
  `{ id, version: 1 }`, `LeaveWaitingListCommand(actor, entryId)` → 204). `waiting_list.manage`
  (owner/office) sees and manages every entry; `waiting_list.manage.own` limits a student to
  themself and a parent to consented linked students (join for anyone else → `403`, list shows only
  theirs, leave of an entry they cannot see → `404`). Join: unknown student / inactive lesson type →
  `404`, `409 student_not_active`, lesson type of another licence class → `400 validation_error`,
  an active entry for the same student and lesson type → `409 already_on_waiting_list` (partial
  unique index). Leave sets `active = false` (no event). The list filters `studentId`,
  `lessonTypeId`, `active` (no default), id cursor. Appends `WaitingListJoined` (aggregate
  `waiting_list`, version 1).
- Slot offers (fill a gap): `POST /v1/slot-offers` (`slot_offers.manage`;
  `CreateSlotOfferCommand(actor | null, body, source)` → `{ id, version: 1 }`, source `manual` from
  HTTP). The command (and the internal `SlotOfferCreator` service that the cancellation and gap
  sources below reuse with `source: 'cancellation' | 'gap'` and `excludeStudentIds`) validates the slot like
  a booking without a student (active instructor and lesson type `404`, vehicle, availability,
  min gap, `409 slot_unavailable` with `in_past` or `too_soon` when
  `expiresAt = min(now + slotOfferTtlMinutes, start − 2 h)` is not in the future), rejects a slot
  overlapping a booked/completed lesson of the instructor or vehicle (`409 lesson_conflict`) and
  resolves the audience with the pure `selectAudience` (scheduling `domain/slot-offers.ts`):
  eligible = active, the lesson type's licence class, instructor allowed (assigned, or no
  assignment), billing `LedgerWriter.balance >= creditMinutes`; then (1) waiting-list entries for the
  same lesson type whose preferred windows contain the slot (school-local weekday and times), first
  come first served by `created_at`; else (2) students whose `area` (trimmed, case-insensitive)
  equals the slot's area = the area of the student of the instructor's previous lesson that local
  day, else of the next. An explicit `studentIds` replaces (1)/(2) but keeps the eligibility filters.
  Nobody eligible → `409 no_eligible_students` (the service returns `null` without writing).
  Appends `SlotOfferCreated` (aggregate `slot_offer`, version 1); messaging notifies.
  `GET /v1/slot-offers` (`ListSlotOffersQuery`): `slot_offers.manage` sees every offer (optional
  `status`); students/parents see offers made to them or their consented linked students, default
  `status = open` and, for open, only `expiresAt > now`. Ordered by start, cursor
  `<start ISO>_<id>`. `POST /v1/slot-offers/{id}/accept` (`slot_offers.accept`, idempotency-keyed;
  `AcceptSlotOfferCommand(actor, offerId, { studentId? })` → `LessonResponse`, 201): unknown or other
  school's offer → `404`; students/parents accept for their own student (`studentId` of someone else →
  `403`; a parent with several offered students must send `studentId` → `400`), staff must send
  `studentId`. One transaction: `UPDATE slot_offers SET status = 'taken', accepted_by_student_id …
  WHERE id AND status = 'open' AND expires_at > now() AND student = ANY(offered_to_student_ids)`; no
  row → `409 offer_unavailable` (taken, expired or not in the audience); then `BookLessonCommand(actor,
  …, bookedVia = 'slot_offer')` with the offer's instructor, vehicle, type and start (same ledger lock,
  balance, entitlement and conflict rules; its errors roll the offer back to `open`), sets
  `lesson_id` and appends `SlotOfferAccepted` (version 2) after `LessonBooked`.
- Offer expiry (worker): scheduled job `scheduling.slot-offer-expiry` (every 60 s, per school via
  `PerSchoolJobs`) runs an internal expire command (not exported): open offers with
  `expires_at <= now` become `expired` and each appends `SlotOfferExpired` (version 2). Re-running
  finds nothing, so it is idempotent.
- Offers from cancellations (worker): subscriber `scheduling.slot-offers-from-cancellations` consumes
  `LessonCancelled` and runs an internal command (not exported) with `now` = handling time. It re-reads
  the lesson row and does nothing unless the lesson is still `cancelled`, starts more than 2 h after
  `now`, the instructor has no booked/completed lesson overlapping the period (re-booked) and there is
  no open, unexpired offer of that instructor overlapping it (checked under a per-instructor
  transaction advisory lock). Otherwise it creates a `cancellation` offer for the same instructor,
  vehicle, lesson type and start, excluding the cancelling student. Nobody eligible, or a slot that no
  longer validates (any 4xx from the creator: availability, min gap, conflict, inactive type), is
  skipped quietly. Re-delivery is skipped by `event_deliveries`; a replayed handle finds the open offer.
- Gap scan (worker): scheduled job `scheduling.slot-offer-gap-scan` (`0 2 * * *` UTC, per school via
  `PerSchoolJobs`) runs an internal scan command with an explicit `now` (not exported). Range: `now` to
  school-local midnight 7 days after today's local date. Offerable types: active lesson types of kind
  `lesson` (exam types are never offered), shortest first. For every active instructor, gaps = weekly
  availability (opening hours and time off applied) minus booked/completed lessons padded by
  `min_gap_minutes`, starting on the 15-minute grid more than 2 h after `now`, at least as long as the
  shortest offerable type (pure `findGaps`, `domain/free-gaps.ts`). Gaps are taken earliest first; a
  gap overlapping an open, unexpired offer of that instructor is skipped; otherwise the shortest type
  that fits (with the first free active vehicle of its licence class, by plate, when it needs one) and
  has an eligible audience gets a `gap` offer starting at the gap start. Cap: an instructor has at most
  **5** open unexpired `gap` offers (existing ones count), so a second run creates nothing new.
- Uses (slot offers): training `ListStudentBookingProfilesQuery`, `GetStudentBookingProfileQuery`,
  `ListStudentNamesQuery`; billing `LEDGER_WRITER.balance`; school `GetSchoolQuery`,
  `GetSchoolSettingsQuery`.
- Change feed (worker): projection `scheduling.change-feed` is the only writer of `change_feed`. It
  runs with the kernel per-school advisory lock (`serializePerSchool`), so `seq` follows commit order
  within a school and a cursor never skips a row. Rows carry no state: `{ entity, entity_id, op
  (upsert | delete | revoke), audience_membership_id (null = school-wide), at = event occurredAt }`.
  "Assigned" = active `student_instructors` rows (training's booking profile).
  Lesson events → `upsert lesson` for the lesson's instructor and the student's assigned instructors;
  `LessonMoved` away from an instructor who is not assigned to the student → `revoke lesson` for
  them first. `StudentCreated`/`StudentEnrolled` → `upsert student`, `StudentArchived`/
  `StudentAnonymized` → `delete student`, both for the assigned instructors. `InstructorAssigned` →
  for that instructor `upsert student`, the student's `booked` lessons and all their progress
  entries. `InstructorUnassigned` → for that instructor `revoke student`, the student's lessons
  taught by someone else and progress entries of those lessons (lessons in their own diary stay).
  `ProgressRecorded` → `upsert progress_entry` per entry for the lesson's instructor and the assigned
  instructors. `VehicleChanged` → school-wide `upsert vehicle` (`delete` when `active = false`).
  `AvailabilityChanged`/`TimeOffAdded` → `upsert availability` (entity id = instructor membership)
  for that instructor.
- Sync pull: `GET /v1/sync?cursor=&limit=` (`sync.use`; `ListSyncChangesQuery(actor, params)` →
  `SyncPullResponse`): rows with `seq > cursor` (default `0`) that are school-wide or addressed to the
  caller's membership, by `seq`, at most `limit` (default 200, max 500). Each `upsert` row is joined
  to the current state at read time, with the same visibility rule as the projection: lesson
  (`LessonResponse`) when the caller teaches it or is assigned to its student; student
  (`SyncStudent`, phone from the student's user, `isPrimary` for the caller) when active and assigned
  to the caller (each one returned writes `audit_log` `student.read`); progress entry when the caller
  teaches its lesson or is assigned to its student; vehicle when active; availability (weekly
  pattern without time off) only the caller's own. A missing entity (or archived/anonymized student,
  inactive vehicle) comes back as `delete`, a no longer visible one as `revoke`, both with
  `data: null`; stored `delete`/`revoke` rows are returned as they are. `nextCursor` = last returned
  `seq` (the request cursor when the page is empty), `hasMore` when more rows follow. Uses training
  `ListStudentBookingProfilesQuery`, `ListStudentIdsForInstructorQuery`, `ListProgressEntriesQuery`,
  `ListStudentNamesQuery`; school `ListVehiclesQuery`; identity `MembershipDirectory.contactsOf`.
- Sync push: `POST /v1/sync` (`sync.use`, not idempotency-keyed: ops are idempotent on `opId`;
  `ApplySyncOperationsCommand(actor, SyncPushRequest)` → `SyncPushResponse { results }`, 200, one
  result per op in request order). It never writes `change_feed`: the ops' normal events
  (`LessonBooked`, `ProgressRecorded`, `CashPaymentRecorded`, …) feed the projection. The batch takes a
  per-membership transaction advisory lock, then applies the ops **in order**, each in its own
  savepoint (kernel `TenantContext.savepoint`); a failed op rolls back only its own writes and later
  ops still apply; the request commits with all results. Replay: an `opId` already in
  `sync_operations` from the same membership returns the stored result unchanged and applies nothing
  (a rejection is stored and replayed too); from another membership → `rejected op_id_reused` (not
  stored). Each op first needs its HTTP route's permission (`lesson.create` `lessons.create(.own)`,
  `lesson.move` `lessons.move(.own)`, `lesson.cancel` `lessons.cancel(.own)`,
  `lesson.complete`/`lesson.no_show` `lessons.complete(.own)`, `progress.upsert`
  `progress.write.own`, `private_note.upsert` `private_notes.write.own`, `payment.cash`
  `payments.cash.record`), else `forbidden`; then it dispatches the public command with the caller:
  `lesson.create` → `BookLessonCommand(actor, { …payload, instructorMembershipId: caller }, lessonId,
  'sync')` (client UUIDv7 id, `booked_via = sync`); `lesson.move`/`cancel`/`complete`/`no_show` →
  `MoveLessonCommand`/`CancelLessonCommand`/`CompleteLessonCommand` (no progress)/`MarkNoShowCommand`
  with `version = baseVersion`; `progress.upsert` → training `RecordProgressCommand` with one entry
  whose `id` is `progressEntryId` (entries accept an optional client `id`; an existing row for the
  same lesson, student and syllabus item keeps its id); `private_note.upsert` →
  `UpsertPrivateNoteCommand({ noteId: privateNoteId, … })`; both take the student from
  `GetLessonQuery(lessonId)` (`not_found` when missing); `payment.cash` →
  `RecordCashPaymentCommand(actor, { …, method: 'cash' }, paymentId)`. Results: applied →
  `{ status: 'applied', id, version }` of the affected entity, `error`/`serverState` null; a 4xx from
  the command (including database conflicts, mapped like the HTTP filter) → `{ status: 'rejected',
  id: null, version: null, error: { code, message }, serverState }`; a 5xx fails the whole request.
  `serverState` (lesson ops only, never for `forbidden`/`not_found`) is the current `LessonResponse`
  of the op's lesson, or for a `lesson.create` `lesson_conflict` of the clashing lesson, when the
  caller teaches it, holds `calendar.read` or is assigned to its student; otherwise null. A rejected
  lesson op whose `baseVersion` is lower than that lesson's version reports `version_conflict`
  whatever else failed. Progress and private notes are last-write-wins **in server arrival order**
  (the later op in the batch or a later batch wins; `clientAt` is ignored). `clientAt` is kept for
  display only in `sync_operations.result` next to the stored result (no column on progress or
  notes).

### training

- Nest: `TrainingModule`, `TrainingWorkerModule`.
- Commands: `CreateStudentCommand`, `UpdateStudentCommand`, `ArchiveStudentCommand`,
  `AnonymizeStudentCommand`, `EnrolStudentCommand`, `ReplaceStudentInstructorsCommand`,
  `LinkGuardianCommand`, `GiveGuardianConsentCommand`, `RecordProgressCommand`,
  `UpsertPrivateNoteCommand`, `RecordTestAttemptCommand`, `ExportStudentDataCommand`,
  `CaptureLeadCommand`, `UpdateLeadCommand`, `ConvertLeadCommand` (leads, below; the worker-only
  lead purge command is internal).
- Queries: `ListLeadsQuery`, `GetLeadQuery` (leads, below), `ListStudentsQuery`, `GetStudentQuery`, `GetStudentInstructorsQuery`,
  `GetStudentProgressQuery`, `GetSyllabusQuery`, `GetStudentBookingProfileQuery`,
  `GetStudentByUserQuery` (the caller's own student record, by `students.user_id`),
  `ListLinkedStudentIdsQuery` (students linked to a guardian user with consent given and not
  revoked), `GetStudentMinorStatusQuery` (`{ isMinor, dateOfBirth, ageOfMajority,
  hasGuardianConsent }`, null for an unknown student), `GetStudentRecipientsQuery`
  (`{ studentUserId, guardianUserIds }`, guardians with consent only), `GetTestAttemptStatsQuery`,
  `HasPassedPracticalQuery(studentId)` → boolean (a `practical` test attempt with result `passed`
  exists; false for an unknown student; the school module's review gate),
  `ListStudentIdsForInstructorQuery` (active assignments), `ListStudentNamesQuery(studentIds)` →
  `[{ studentId, fullName }]` (scheduling's calendar and lesson views),
  `ListStudentBookingProfilesQuery({ studentIds?, area?, licenceClass?, activeOnly? })` →
  `StudentBookingProfile[]` (no permission check, current school; `area` compares trimmed and
  case-insensitive; scheduling's slot-offer audience).
  `ListProgressEntriesQuery({ ids?, studentIds? })` → `SyncProgressEntry[]` (`{ id, lessonId,
  studentId, syllabusItemId, level, note, version }`, no permission check, current school, an empty
  list filter returns `[]`; private notes are never included; scheduling's `change_feed` projection
  and `GET /v1/sync`).
  `StudentBookingProfile` also carries `primaryInstructorMembershipId` and
  `allowedInstructorMembershipIds` (active assignments).
  `RecordProgressCommand(actor, { lessonId, studentId, entries: [{ id?, syllabusItemId, level 1–5, note }] })
  → { entries: [{ id, version }] }` upserts one `progress_entries` row per (lesson, student, syllabus
  item), bumps its `version` and appends `ProgressRecorded` (`id` = a client id for a new row, used by `POST /v1/sync`; ignored when the row exists); `UpsertPrivateNoteCommand(actor,
  { noteId?, lessonId, studentId, body }) → { id, version }` keeps one note per (lesson, student,
  author membership), last write wins, no event. Both check the "instructor sees student" rule and
  that the lesson exists and belongs to the student (404 otherwise). `GetTestAttemptStatsQuery({ from, to, bucket })` → `[{ period, kind, attempts, passed }]`
  (school-local dates, inclusive; `period` = first day of the day/week/month bucket).
- Emits: `StudentCreated`, `StudentEnrolled`, `StudentArchived`, `StudentAnonymized`,
  `GuardianLinked`, `GuardianConsentGiven`, `InstructorAssigned`, `InstructorUnassigned`,
  `ProgressRecorded`, `TestAttemptRecorded`. All use aggregate `student` (id = student id) with
  `students.version` bumped once per event. Also `LeadCaptured`, `LeadStatusChanged`,
  `LeadConverted` (aggregate `lead`, below).
- Consumes (worker, `TrainingWorkerModule`): `MembershipCreated` / `MembershipRolesChanged` with a
  `studentId` (subscriber `training.membership-student-link`): an added `student` role sets
  `students.user_id`, an added `parent` role creates the guardian link (`GuardianLinked`). The
  worker also registers training's public queries, and `SchoolWorkerModule` registers
  `GetSchoolSettingsQuery` for them. Projection `training.student-list` builds `rm_student_list` from
  student, assignment, progress and test-attempt events (fields re-read from training's write
  tables), `LedgerEntryRecorded` (`balance_minutes = balanceAfter`, staleness per `student_ledger`
  version) and `LessonBooked/Moved/Cancelled/Completed/MarkedNoShow` (kept in the projection-owned
  `rm_student_lessons`; next = earliest booked lesson, last = latest completed lesson).
- Uses: billing `ListInvoicesQuery` / `ListLedgerEntriesQuery` and documents `ListDocumentsQuery`
  (student export, called directly; no fallback), identity `AnonymizeUserCommand` (student deletion), scheduling `GetLessonQuery`.
- `GET /v1/guardian-links` (training's `GuardianLinksController`, `consent.give`, i.e. parents;
  a student gets 403): the caller's guardian links in the school, `{ items: [{ id, studentId,
  studentName, status, consentAt, createdAt }], nextCursor }` newest first (cursor = link id),
  revoked links and anonymized students left out. `status` is derived (the table has no status
  column): `consented` when `consent_at` is set, else `pending_consent` for a minor (school
  `age_of_majority`) and `not_required` for an adult. Lives in training, not under `/v1/me`,
  because training owns `guardian_links`.
- Private notes never leave training through student or parent responses; staff read them only via
  `GET /v1/students/{id}/private-notes` (audited `private_notes.read`).
- Leads (enrolment page design §4.4, §5.2, §5.3; table `leads`, RLS `leads_tenant`, migrations
  0031/0032): `CaptureLeadCommand({ source: 'page' | 'manual', body, requestIpHash })` →
  `{ id, version }` (the event actor is the tenant scope's user, null on the public form; `email`
  lower-cased; a repeat enquiry with the same phone or lower-cased email within 30 days whose lead
  is not `lost` returns that lead's id, appends the message to `note` (`\n---\n`) and bumps
  `version` without an event (`domain/leads.ts` `findDuplicate`); `manual` needs platform
  `SchoolHasFeatureQuery('enrolment_page')` → else `403 feature_not_in_plan` and stores
  `consent_text_version = 'manual'` when none is given), `UpdateLeadCommand(actor, leadId,
  { status?: contacted | lost, note?, lostReason? })` → `{ id, version }` (`LeadStatusChanged` only
  when the status changes; a status change on a converted lead → `409 lead_already_converted`;
  `contacted` clears `lost_at`/`lost_reason`), `ConvertLeadCommand(actor, leadId, body)` →
  `{ id, version, studentId, invitationId, parentInvitationId }` (locks the lead; 404 / `409
  lead_already_converted`; `CreateStudentCommand` with the lead's name and licence class, then
  identity `CreateInvitationCommand(actor.userId, ['student'], lead contact, studentId, [])` when
  `invite` (default true) and, for a minor lead with `inviteParent`, `LinkGuardianCommand` with
  the guardian contact (email if it contains `@`, else phone), which issues a pending parent
  invitation; all in the request transaction); the internal purge command (`now` → `{ deleted,
  ipHashesCleared }`) deletes `lost`/`converted` leads whose `coalesce(converted_at, lost_at,
  created_at)` is over 12 months old and nulls `request_ip_hash` after 30 days (no events; worker
  only). Queries: `ListLeadsQuery(params)` (`{ status?, q?, cursor?, limit }`, newest first, cursor
  = lead id, `q` matches name, phone or email), `GetLeadQuery(id)` (404 when not in this school).
  Routes: `GET /v1/leads`, `GET /v1/leads/{id}` (`leads.read`), `POST /v1/leads`,
  `PATCH /v1/leads/{id}`, `POST /v1/leads/{id}/convert` (`leads.manage`; convert needs
  `Idempotency-Key`), all in `LeadsController`. Public: `POST /v1/public/schools/{slug}/leads`
  (`PublicLeadsController`, `@Public()`, rate limit `leads` 10 per IP per hour): non-empty
  honeypot `website` → `201 { id: <random> }` with no write; else school `ResolvePublicSchoolQuery`
  in a school-less scope (404 `school_not_found`), then `CaptureLeadCommand` in
  `runInTenant({ schoolId, userId: null })` with `requestIpHash` = sha256 hex of `req.ip`; answers
  `201 { id }` only. Emits `LeadCaptured` v1 `{ leadId, source, licenceClass, isMinor, fullName,
  capturedAt }`, `LeadStatusChanged` v1 `{ leadId, status, changedAt }`, `LeadConverted` v1
  `{ leadId, studentId, convertedAt }` (aggregate `lead`, aggregate version = `leads.version`, so
  note-only changes and repeat enquiries leave gaps). Worker job `training.lead-purge`
  (`infra/lead-purge.job.ts` `LeadPurgeJob`, `15 3 * * *`, runs the purge command per school via
  `PerSchoolJobs`). Staff reads of a lead are not audited (design §8).

### theory

- Nest: `TheoryModule`.
- Commands: `ImportQuestionPackCommand`, `PublishQuestionPackCommand`, `StartTheorySessionCommand`,
  `SubmitTheoryAnswerCommand`, `FinishTheorySessionCommand`.
  - `ImportQuestionPackCommand(actor, body)` (platform route, school-less request): parses the body
    with `QUESTION_BANK_IMPORTER` (semantic errors → 400 `validation_error` with `details.issues`),
    inserts the pack as `draft` with its questions (`external_ref` = `ref`, `media_key` = `media`,
    `instant_fail`), returns `{ id, version, questionCount }`; the pack version `"2026.1"` is stored
    as the integer `202601`. A second import of the same (country, licence class, language,
    version) → 409 `question_pack_exists`.
  - `PublishQuestionPackCommand(actor, packId)`: `draft` → `published` with `published_at`, appends
    `QuestionPackPublished` (aggregate `question_pack`, version 2; outbox `school_id` null), returns
    `{ id, version: 2 }`. Unknown → 404; already published → 409 `question_pack_already_published`.
    Older published versions stay published (sessions keep their pack).
  - Session commands act only for the caller's own student profile (training
    `GetStudentByUserQuery`); a `theory.use` holder without one → 403 `forbidden`. The pack is the
    current one (same rule as `GetCurrentQuestionPackQuery`; none → 404 `question_pack_missing`).
  - `StartTheorySessionCommand(actor, { mode, category?, questionCount? })` → `TheorySessionResponse`
    (questions never carry `correct`; `mediaUrl` is an `OBJECT_STORAGE` signed download URL valid
    5 minutes, null without media). `question_ids` are fixed at start.
    - `practice`: `questionCount` (default 20, max 100) random questions, optional `category`
      (no questions in it → 400); no deadline.
    - `mock`: `EXAM_RULES.draw(pack.exam, questions)`; `deadline_at = started_at + timeLimitMinutes`.
      Without premium a student gets `FREE_MOCK_EXAMS_PER_WEEK` (3) mock sessions started in the
      rolling last 7 days; the next → 403 `premium_required` (count taken under a per-student
      advisory lock).
    - `mistakes`: premium only (403 `premium_required`); draws questions whose latest answer by the
      student was wrong, matched across pack versions by `external_ref` and served from the current
      pack; `category`/`questionCount` apply; none → 409 `no_mistakes`.
    - Premium = billing `HasEntitlementQuery(studentId, 'premium_theory')` or school setting
      `theoryPremiumFree` (`GetSchoolSettingsQuery`).
  - `SubmitTheoryAnswerCommand(actor, sessionId, { questionId, given })` → `TheoryAnswerResult`.
    Other student's or unknown session → 404; finished → 409 `session_finished`; `deadline_at`
    passed → 409 `session_expired`; question not in the session or an answer index out of range
    → 400. One answer per (session, question), last write wins (unique
    `theory_answers(session_id, question_id)`). Practice/mistakes reveal `correct`,
    `correctAnswers`, `explanation`; mock returns them as null until finish.
  - `FinishTheorySessionCommand(actor, sessionId)` → `TheorySessionResult` with every question's
    `given`, `correct`, `correctAnswers`, `points`, `explanation`. Unanswered counts as wrong.
    Mock: `EXAM_RULES.score(pack.exam, …)` → `score`, `maxScore`, `passed`; practice/mistakes:
    points of correct answers, `passed: null`. Allowed after the deadline (scores what was
    answered). A second finish → 409 `session_finished`. Appends `TheorySessionFinished`
    (aggregate `theory_session`, version 2).
  - Answer history (mistakes, stats): every answer of the student's sessions except those of an
    unfinished mock exam, so mock correctness never leaks before finish.
- Queries: `GetCurrentQuestionPackQuery`, `ListTheoryMistakesQuery`, `GetTheoryStatsQuery`.
  - `ListTheoryMistakesQuery(actor, { cursor?, limit, category? })` (own student, `theory.use`, no
    premium needed): latest-wrong questions per `external_ref`, served from the current pack (refs
    not in it are skipped), newest wrong first, `wrongCount` = wrong answers for the ref across
    sessions and pack versions; cursor = the last question id. No current pack → 404.
  - `GetTheoryStatsQuery(actor, { studentId? })`: own student, or `studentId` checked through
    training `GetStudentQuery` (student self, consented parent, assigned instructor, office/owner;
    others 404; staff reads audited there). Staff without `studentId` → 400. Counts per category
    over the current pack's refs using the latest answer per ref (`openMistakes` = answered −
    correct); mock totals over all finished mocks; `mockExamsLeftThisWeek` null for premium.
  - `GetCurrentQuestionPackQuery(actor, { licenceClass?, language? })`: the highest published
    `version` for the school's country (school `GetSchoolQuery`) and the licence class and exam
    language, taken from the query or else from the caller's student profile (training
    `GetStudentByUserQuery` + `GetStudentQuery`). Staff without a student profile must pass both
    (400 otherwise). None published → 404 `question_pack_missing`.
- Emits: `QuestionPackPublished`, `TheorySessionFinished`.
- Tables `question_packs` and `questions` are global (no `school_id`, no RLS); `questions.instant_fail`
  (default false) marks instant-fail questions of `error_points` packs.
- Adapters (`apps/api/src/adapters`):
  - `QUESTION_BANK_IMPORTER` → `QuestionBankImporter.parse(source: unknown): ImportedQuestionPack`
    (throws `QuestionPackInvalidError { issues }`). Dev implementation `JsonQuestionBankImporter`
    for the SPEC §9 JSON format (also checks unique refs, correct indexes, instant-fail only with
    `error_points`, and that the exam rules can be drawn from the questions);
    `loadQuestionPackFile(importer, file)`, `packVersionNumber("2026.1") === 202601`.
  - `EXAM_RULES` → `ExamRulesRegistry` (strategies `FractionExamRules`, `ErrorPointsExamRules`, chosen
    by `rules.rules`): `draw(rules, questions, random?)` returns `rules.questions` questions honouring
    `rules.categories` (rest filled from any category, shuffled; inject `random` for determinism);
    `score(rules, questions: { id, category, points, correct, instantFail }[], answers: { questionId,
    given }[])` → `{ score, maxScore, errorPoints, instantFailedQuestionIds, passed }`. An answer is
    correct when `given` equals the `correct` set; unanswered counts as wrong; the last answer per
    question wins. `fraction`: passed when `score >= passMark * maxScore`. `error_points`: passed
    when `errorPoints <= maxErrorPoints` and no instant-fail question is wrong.
  - CLI: `pnpm --filter @driveos/api question-bank:import <file> [--publish]` runs the same handlers
    as `app_rw` in a school-less transaction (no `app_system`).

### billing

- Nest: `BillingModule`; service `LEDGER_WRITER`. In the worker, `BillingWorkerModule` exports
  `LEDGER_WRITER`; `SchedulingWorkerModule` imports it explicitly (the slot-offer audience reads
  balances there).
- Commands: `CreatePriceItemCommand`, `UpdatePriceItemCommand`, `StartCheckoutCommand`,
  `HandlePaymentWebhookCommand`, `RecordCashPaymentCommand`, `IssueRefundCommand`,
  `AdjustLedgerCommand`, `GrantEntitlementCommand`, `ConsumeEntitlementCommand`,
  `ReleaseEntitlementCommand`, `MarkStatementPaidCommand`.
- Queries: `ListPriceItemsQuery`, `ListPublicPriceItemsQuery` (active items with
  `showOnPublicPage` as `{ id, name, kind, amountMinor, currency, creditMinutes }[]`, by sort order
  then name; the school module's public page), `GetShopQuery`, `GetBalanceQuery`, `ListLedgerEntriesQuery`,
  `GetStudentEntitlementsQuery`, `HasEntitlementQuery`, `ListInvoicesQuery`, `GetInvoicePdfQuery`,
  `ListPlatformStatementsQuery`, `ListSchoolPlatformStatementsQuery`.
- Emits: `PaymentSucceeded`, `PaymentFailed`, `CashPaymentRecorded`, `RefundIssued`,
  `LedgerEntryRecorded`, `EntitlementGranted`, `InvoiceIssued`, `CreditNoteIssued`,
  `PlatformChargeCreated`, `PlatformStatementIssued`.
- `GET /v1/invoices` items carry `paymentId` (invoice: the payment whose `invoice_id` is it; credit
  note: the payment of the refund whose `credit_note_id` is it; else null) and `refundedMinor` (sum
  of that payment's refunds not `failed`, the same rule `IssueRefundCommand` caps against; 0 without a
  payment), read from billing's write tables.
- Payment webhooks that fail (bad signature, unknown provider or payment, amount mismatch, error)
  are appended to `payment_webhook_failures` (`school_id` null until the payment is resolved; RLS
  forced, `app_rw` may only insert) and feed the `webhook_failures` alert.
- Worker (`BillingWorkerModule`, loaded by `worker.module.ts` only): subscribers
  `billing.student-fee` (`StudentEnrolled` → `student_fee` charge, once per student) and
  `billing.student-fee-reversal` (`StudentArchived` → `student_fee_reversal` within 14 days of the
  charge, no completed lessons); scheduled job `billing.monthly-statements` (02:00 UTC on the 1st,
  previous month). Needs platform's `GetCurrentSubscriptionQuery` in the worker
  (`PlatformWorkerModule`).

### documents

- Nest: `DocumentsModule`; worker: `DocumentsWorkerModule` (loaded by `worker.module.ts` only).
- Commands: `CreateUploadUrlCommand`, `CompleteDocumentUploadCommand`, `CreateContractTemplateCommand`,
  `CreateContractCommand`, `SignContractCommand`.
  - `CreateUploadUrlCommand(actor, { kind, mime, sizeBytes, ownerStudentId? })` creates a `pending`
    document (`storage_key = <schoolId>/<documentId>`, never client-chosen) and returns a presigned
    PUT (15 min) with the headers the client must send (content type, length, SSE). Staff
    (`documents.read`) upload for any student or for the school (no owner); instructors for students
    they are assigned to; students for themselves (owner defaults to their own record); parents
    (only with a `documents.upload` grant) for linked students. Another student → 403.
  - `CompleteDocumentUploadCommand(actor, documentId)` (uploader or staff) checks the object with a
    HEAD (size and mime must match), sets `ready` and appends `DocumentUploaded` (aggregate
    `document`, version 1). Idempotent once `ready`; a missing or different object → 409
    `upload_incomplete`.
  - `CreateContractTemplateCommand` adds a row with `version = max(version for that name) + 1`
    → `{ id, version }`.
  - `CreateContractCommand(actor, { studentId, templateId })` snapshots the template body and version,
    sets `requires_guardian` from training's `GetStudentMinorStatusQuery`, and appends
    `ContractCreated` (aggregate `contract`, version 1) with `signerUserIds` = the student's user (if
    any) plus, for a minor, the consenting guardians (`GetStudentRecipientsQuery`). Inactive template
    → 409 `contract_template_inactive`.
  - `SignContractCommand(actor, contractId, { role? }, { ip, userAgent })` derives the signer role
    (student = the student's user, guardian = a consenting guardian; `role` may only narrow), records
    signer, role, time, IP and user agent, appends `ContractSigned` (version = signatures + 1) and,
    once every required role has signed (`student`, plus `guardian` for a minor), sets `signed` /
    `completed_at` and appends `ContractCompleted`. Same role twice → 409 `already_signed`; staff or a
    role the caller does not hold → 403.
- Queries: `ListDocumentsQuery`, `GetDocumentDownloadUrlQuery`, `ListContractTemplatesQuery`,
  `GetContractQuery`, `ListContractsQuery`.
  - Documents: staff (`documents.read`) see all; instructors the documents of assigned students
    (`ListStudentIdsForInstructorQuery`) and of students they taught in the last 90 days or have a
    future lesson with (scheduling `ListStudentIdsWithLessonsQuery(membershipId, now − 90 days)`,
    cancelled lessons excluded; the same set limits instructor uploads);
    students their own; parents their linked (consented) students. Others → 404. Staff and instructor
    reads are audited: `student.documents.read` (once per student in a listed page) and
    `document.download` (target `document`). `GetDocumentDownloadUrlQuery` returns a presigned GET
    valid 5 minutes (`expiresAt`); a `pending` document → 409 `document_not_ready`.
  - Contracts (`GetContractQuery`, `ListContractsQuery(actor, { studentId?, status?, cursor, limit })`):
    staff with `contracts.manage` or `documents.read` see all (`GetContractQuery` audits
    `contract.read`); students their own; parents linked students.
- Emits: `DocumentUploaded`, `ContractCreated`, `ContractSigned`, `ContractCompleted`.
- Consumes (worker): `StudentAnonymized` (subscriber `documents.student-anonymized`) deletes the
  student's objects from storage and their `documents` rows; contracts and signatures stay.
- Uses: training `GetStudentMinorStatusQuery`, `GetStudentRecipientsQuery`, `GetStudentByUserQuery`,
  `ListLinkedStudentIdsQuery`, `ListStudentIdsForInstructorQuery`, `GetStudentBookingProfileQuery`,
  `ListStudentNamesQuery`; identity `MembershipDirectory`; platform `AUDIT_WRITER`; adapter
  `OBJECT_STORAGE` (`S3ObjectStorage` on MinIO with SSE; `FakeObjectStorage` in tests).

### messaging

- Nest: `MessagingModule`.
- Commands: `SendMessageCommand`, `MarkConversationReadCommand`, `SendNotificationCommand` (called by
  other modules' worker subscribers, never from a command handler; registered in the worker).
- `SendNotificationCommand({ recipients, template, payload, timing, sendAt?, skipAfter?, channels?,
  dedupeKey? }) → { notificationIds }` joins the caller's tenant transaction and only writes
  `notifications` rows; it never calls a provider.
  - `recipients`: `{ userIds }`, `{ membershipIds }` (both filtered to members of the current school),
    or `{ contacts: [{ phone?, email?, locale? }] }` for people without a user yet (invitations: the
    row keeps `user_id` null and the phone/email in `address`).
  - `template` (`NotificationTemplate`) and its zod-validated `payload`: `invitation { url, expiresAt }`,
    `lesson_booked | lesson_cancelled | lesson_reminder { lessonId, start, instructorName }`,
    `lesson_moved { …, previousStart }`, `invoice_issued { invoiceId, number, totalMinor, currency }`,
    `contract_created { contractId }`, `platform_statement_issued { statementId, month, totalMinor,
    currency }`, `growth_report_generated { reportId, month }`, `message_received { conversationId,
    senderName, preview }`, `slot_offer_created { offerId, start, expiresAt }`,
    `guardian_consent_requested { guardianLinkId, studentId, url }`. Texts live in i18n
    `notifications.<template>.{push_title,push_body,sms,email_subject,email_text}`.
  - Default channels: invitation sms + email (by contact); lesson templates push, or email when the
    user has no device; invoice, contract, statement, growth report, slot offer and guardian consent
    push + email;
    chat push only.
  - `timing` (SPEC §7, school zone, quiet hours from school settings, may wrap midnight; email is
    never held): `deferred` → end of quiet hours; `advanced` → if `sendAt` is in quiet hours, one
    minute before they started (or now if that has passed); `immediate` → now; `email_only_at_night`
    → push outside quiet hours, email inside them, never SMS. `sendAt` defaults to now.
  - A row whose send moment is at or after `skipAfter` is written as `skipped` (`last_error =
    expired`). `dedupeKey` is unique per (school, user, channel): a repeat returns no new id (the
    reminder jobs use `<lessonId>/24h/<start>` / `<lessonId>/2h/<start>`).
- Queries: `ListConversationsQuery`, `ListMessagesQuery`, `PlanNotificationMomentQuery({ timing,
  sendAt }) → Date` (the moment a push with that timing and nominal send time would be scheduled for
  in the school zone and quiet hours, not clamped to now; scheduling uses it to delay reminder jobs).
- Emits: `MessageSent` (aggregate `message`, version 1; `recipientUserIds` = every participant except
  the sender: the student's user, plus the instructor for `student_instructor` chats or every active
  owner/office user for `student_school` chats); `DeviceTokenInvalidated` from the notification dispatcher, see
  Delivery).
- Consumes (worker): `StudentCreated`, `InstructorAssigned` (subscriber `messaging.conversations`)
  open one `student_school` chat per student and one `student_instructor` chat per (student,
  instructor); unique partial indexes make both idempotent.
- Notification subscribers (worker, each calls `SendNotificationCommand`):
  - `messaging.invitation-notifications`: `InvitationCreated` → `invitation`, deferred, SMS to the
    phone and email to the address, link `APP_PUBLIC_URL/invitations/<acceptToken>`, skipped after
    `expiresAt`.
  - `messaging.lesson-notifications`: `LessonBooked`, `LessonMoved`, `LessonCancelled` → the
    student's user and guardians, minus the actor; deferred, but immediate when a cancelled or moved
    lesson (old or new start) begins within 12 h; skipped after the lesson start.
  - `messaging.billing-notifications`: `InvoiceIssued` → `payerUserIds` or the student and guardians;
    `PlatformStatementIssued` → `ownerUserIds`; deferred.
  - `messaging.contract-notifications`: `ContractCreated` → `signerUserIds`, deferred.
  - `messaging.chat-notifications`: `MessageSent` → `recipientUserIds`, immediate push with the
    sender's name and the ≤ 140-char preview.
  - `messaging.slot-offer-notifications`: `SlotOfferCreated` → the offered students and their
    guardians, `email_only_at_night`, skipped after `expiresAt`.
  - `messaging.growth-report-notifications`: `GrowthReportGenerated` → `ownerUserIds`, deferred.
  - `messaging.guardian-consent-notifications`: `GuardianLinked` with `consentRequired` →
    `guardian_consent_requested` to the guardian user, deferred (email at once, push after quiet
    hours), link `APP_PUBLIC_URL/parent/consent/<guardianLinkId>`, `dedupeKey`
    `guardian-consent:<guardianLinkId>`; nothing for an adult student. The push `data` carries
    `template`, `guardianLinkId` and `studentId`.
- Delivery: `messaging.notification-dispatch` (every 30 s, per school) takes up to 100 due
  `scheduled` rows (`for update skip locked`), marks rows past `skip_after` `skipped`, renders the
  template in the row's/user's locale (fallback: school locale) and sends through `PushSender` (every
  device token of the user), `SmsSender` (phone) or `EmailSender` (email). Outcomes: `sent`,
  `skipped` (`no_device`, `no_phone`, `no_email`, `expired`) or `failed` (`last_error`). Immediate
  notifications wait at most one tick. Every device whose token `PushSender` reports as
  `invalid_token` gets a `DeviceTokenInvalidated` v1 `{ deviceId, userId, notificationId }`
  (aggregate `device`, version 1) appended in the dispatch transaction; identity prunes the device.
- Scheduled: `messaging.chat-retention` (03:30 UTC, per school) runs an internal purge command
  (not exported), deleting messages older than `school_settings.chat_retention_months`;
  `conversation_members.last_read_message_id` is `ON DELETE SET NULL`.
- Uses: training `GetStudentByUserQuery`, `GetStudentBookingProfileQuery`,
  `GetStudentRecipientsQuery`, `ListStudentNamesQuery`; school `GetSchoolQuery`,
  `GetSchoolSettingsQuery`; identity `MembershipDirectory`, `ListDevicesForUsersQuery`.
- Chat rules (D5): participants are derived, not stored. `student_school`: the student and every
  `chat.read_all` holder (owner/office) may read and post. `student_instructor`: the student and that
  instructor may post; owner/office may read and mark read but get `403 chat_read_only` on post, and
  the conversation carries `schoolCanRead: true` so clients show the notice. Instructors see only
  their own instructor chats; an unassigned instructor keeps read access but cannot post; all chats
  of an archived or anonymized student are read-only. Parents hold no `chat.*` permission in Phase 1.
  Anyone else gets 404. `conversation_members` rows are upserted on send and read; read pointers
  never move backwards; `unreadCount` counts messages after the caller's pointer not sent by the
  caller. Lists are newest first (`conversations` by last activity, `messages` by `sent_at`).

### reporting

- Nest: `ReportingModule`; worker: `ReportingWorkerModule` (loaded by `worker.module.ts` only).
- Commands: `GenerateGrowthReportCommand(month: 'YYYY-MM') → { id, version: 1 }` (worker only,
  dispatched by the growth job). Aggregates reporting's `rm_school_metrics_daily` for the local days
  of the month (`month-01` … last day; days are already local dates in the school zone) into one
  `growth_reports` row (unique `(school_id, month)`, `month` stored as the 1st):
  - `revenue_in_app_minor`, `revenue_recorded_minor`, `upsells_sold`, `upsell_revenue_minor`: sums of
    the days whose `currency` is the school's current currency (`GetSchoolQuery`), which is the
    report's `currency`; `inapp_share_bp = revenue_in_app / revenue_recorded`.
  - `late_cancellations_kept` / `late_cancel_minutes_kept` = sums of `late_cancellations` /
    `late_cancel_minutes_kept`; `slots_filled` / `slot_fill_minutes` = sums; `no_show_rate_bp =
    no_shows / lessons_due` of the month; `no_show_rate_prev3m_bp` = the same ratio over the three
    previous calendar months pooled (Σ no_shows / Σ lessons_due, not the mean of three rates).
  - Rates are basis points rounded to the nearest integer, 0 when the divisor is 0.
  - Idempotent: an existing row for the month is returned unchanged and no event is appended
    (`insert … on conflict do nothing` + re-read). A new row appends `GrowthReportGenerated`
    (aggregate `growth_report`, id = report id, version 1) with `ownerUserIds` = the active
    memberships with the `owner` role (`identity.MembershipDirectory.listByRole('owner')`).
  - Malformed month → `RangeError`.
- Queries: `GetGrowthReportQuery`, `GetNoShowReportQuery`, `GetRevenueReportQuery`,
  `GetPassRateReportQuery`, `GetUtilisationReportQuery`.
  - `GetGrowthReportQuery({ month? })` (`GET /v1/reports/growth?month=YYYY-MM`, `growthReportSchema`):
    the report of that month, or the latest month's report when `month` is omitted; none →
    `404 growth_report_missing`. Malformed month → 400 `validation_error`.
  - The four range queries take `reportRangeQuerySchema` input `{ from, to, bucket = day|week|month }` (`from <= to`,
    at most 366 days; else 400 `validation_error`) and return one item per period touched by the
    range, zero-filled, plus `totals`. A period is labelled by its first day (ISO week → Monday,
    month → the 1st), even when that day is before `from`; only days inside the range are summed.
    Rates are basis points rounded to the nearest integer, 0 when the divisor is 0:
    `noShowRateBp = noShows / lessonsDue`, `passRateBp = passed / attempts` (items and totals per
    kind, `theory` then `practical`), `utilisationBp = booked / available` (may exceed 10000).
    Revenue sums only rows in the school's current currency and reports that currency.
  - They read only reporting's read models; the school's time zone and currency come from school
    `GetSchoolQuery`. Permission `reports.read`.
- Emits: `GrowthReportGenerated` (consumed by `messaging.growth-report-notifications`, deferred).
- Scheduled: `reporting.growth-report` (hourly, `0 * * * *` UTC, per school via `PerSchoolJobs`):
  "03:00 local on the 1st" is implemented as an hourly check. For each school it takes the local
  date in the school zone; once local time is at or after 03:00 the due month is the calendar
  month before that date, and when that month has no `growth_reports` row it dispatches
  `GenerateGrowthReportCommand(dueMonth)`. Missed ticks (worker down) catch up on the next tick
  on any later day of the month; only the previous month is ever generated.
  `GrowthReportJob.run(now)` takes an explicit `now` for tests.
- Projection `reporting.school-metrics` (worker) consumes `LessonBooked`, `LessonMoved`,
  `LessonCancelled`, `LessonCompleted`, `LessonMarkedNoShow`, `SlotOfferCreated`, `SlotOfferAccepted`,
  `SlotOfferExpired`, `PaymentSucceeded`, `CashPaymentRecorded`, `RefundIssued`, `TestAttemptRecorded`,
  `AvailabilityChanged`, `TimeOffAdded` (all version 1; no payload change was needed). Days are
  local dates in the school's time zone at the time the event is projected.
  - `rm_school_metrics_daily` (one row per school and local day; every write is a single
    `insert … on conflict do update` increment):
    - money, on the local day of `occurredAt` (cash basis, D3): `revenue_in_app_minor` += in-app
      `PaymentSucceeded`, −= `RefundIssued` with `method = in_app`; `revenue_recorded_minor` +=
      `PaymentSucceeded` and `CashPaymentRecorded`, −= every refund; `refunds_minor` += refunds;
      `upsells_sold`/`upsell_revenue_minor` += payments (in-app or recorded) for `priceItemKind =
      upsell` (refunds are not netted); `package_minutes_sold` += `creditMinutes` of payments for
      `priceItemKind = package`. `currency` comes from the first event of the day (the school
      currency for non-money events).
    - lessons, on the local day of the lesson start: `instructor_minutes_booked` (end − start) while
      booked, completed or no-show; `lessons_completed`; `no_shows`; `lessons_due` (completed +
      no-show, the divisor of the no-show rate); `late_cancellations` / `late_cancel_minutes_kept`
      count late cancellations whose credit was kept (`late` and `creditMinutes − minutesRestored >
      0`; a staff override that restores the credit is not counted) plus late moves
      (`LessonMoved.lateCancellation`, `creditMinutesDelta` minutes, on the previous start's day).
    - slot offers, on the local day of the slot start: `slots_offered` (created, accepted or
      expired), `slots_filled` / `slot_fill_minutes` (accepted, `creditMinutes`).
    - `instructor_minutes_available` is not maintained (stays 0): available minutes depend on
      open-ended weekly patterns, so the utilisation report computes them at read time.
  - Lessons and slot offers keep their current contribution in `rm_metric_sources(source_type,
    source_id, day, counts)`; each event replaces it and applies only the difference to the daily
    rows, so a stale or out-of-order event never double counts or leaves minutes behind.
  - `rm_test_attempts_daily(day = takenOn, kind, attempts, passed)` feeds the pass rate.
  - `rm_instructor_availability(instructor, version, effective_from, effective_to, windows)` keeps
    every `AvailabilityChanged`; on a day the highest version whose range covers it wins (same result
    as scheduling's replace). `rm_instructor_time_off` keeps `TimeOffAdded`. Available minutes =
    windows (local wall-clock, real minutes on DST days) minus time off, summed over instructors.
    Opening hours are not applied.
  - Idempotency: the kernel `Projection` skips event versions it has applied per aggregate, and
    `event_deliveries` skips repeated event ids.
- `LedgerEntryRecorded` is not consumed: the ledger carries no money (D3) and package minutes come
  from the payment events.

Subscribers and projections other than identity's are built in step 4; SPEC §3.6 says which module
listens to which event. Every subscriber records the event id and ignores older `aggregate_version`s.

## Recipe: adding a route

All SPEC §8 routes are implemented; there are no 501 stubs left (`routes.test.ts` asserts that
`spec-routes.ts` has no `stub: true` route).

1. Add the route with `@ApiRoute`, a permission decorator (or `@Public()` plus `@RateLimit`) and
   `@Idempotent()` where SPEC §8 asks for it; add the row to `apps/api/test/support/spec-routes.ts`.
2. Add a cross-tenant fixture in `apps/api/test/<module>/route-fixtures.ts` (registered in
   `test/support/route-fixtures.ts`). `apps/api/test/support/route-allowlist.ts` only holds routes
   without tenant data by design (health, `/v1/auth/*`, the payment webhook, fake-pay, Swagger,
   `GET /v1/me`); `routes.test.ts` rejects any other entry and any OpenAPI operation without a
   fixture.
3. `pnpm generate` regenerates the OpenAPI document, the client and the mock routes.

### Foreign ids in request bodies

Single-column foreign keys do not check that the referenced row belongs to the caller's school
(the FK check bypasses RLS). Every handler therefore loads each referenced row under RLS before it
writes. `apps/api/test/cross-tenant/foreign-ids.test.ts` sends, from a school A owner (or A
instructor for `/v1/sync`), a body whose foreign id belongs to school B and asserts the answer and
that the target tables and the outbox are unchanged:

| Route | Foreign id | Answer |
| --- | --- | --- |
| `POST /v1/checkout` | `priceItemId`, `studentId` | 404 `not_found` |
| `POST /v1/payments/cash` | `studentId`, `priceItemId` | 404 `not_found` |
| `POST /v1/refunds` | `paymentId` | 404 `not_found` |
| `POST /v1/ledger/adjustments` | `studentId`, `lessonId` | 404 `not_found` |
| `POST /v1/documents/upload-url` | `ownerStudentId` | 404 `not_found` |
| `POST /v1/contracts` | `studentId`, `templateId` | 404 `not_found` |
| `POST /v1/invitations` | `studentId`, `branchIds[]` | 404 `not_found` |
| `PATCH /v1/memberships/:id` | `branchIds[]` | 404 `not_found` |
| `POST /v1/conversations/:id/read` | `lastReadMessageId` | 400 `validation_error` |
| `POST /v1/lessons` | `studentId`, `instructorMembershipId`, `lessonTypeId`, `vehicleId` | 404 `not_found` |
| `PATCH /v1/lessons/:id` | `instructorMembershipId`, `lessonTypeId`, `vehicleId` | 404 `not_found` |
| `POST /v1/lessons/:id/complete` | `progress[].syllabusItemId` | 400 `validation_error` |
| `POST /v1/sync` `lesson.create` | `studentId`, `lessonTypeId`, `vehicleId` | op `rejected` `not_found` |
| `POST /v1/sync` `lesson.move` | `lessonTypeId`, `vehicleId` | op `rejected` `not_found` |
| `POST /v1/sync` `progress.upsert` | `syllabusItemId` | op `rejected` `validation_error` |
| `POST /v1/sync` `private_note.upsert` | `lessonId` | op `rejected` `not_found` |
| `POST /v1/sync` `payment.cash` | `studentId`, `priceItemId` | op `rejected` `not_found` |
| `POST /v1/waiting-list` | `studentId`, `lessonTypeId` | 404 `not_found` |
| `POST /v1/slot-offers` | `instructorMembershipId`, `lessonTypeId`, `vehicleId` | 404 `not_found` |
| `POST /v1/slot-offers` | `studentIds[]` | 409 `no_eligible_students` |
| `POST /v1/slot-offers/:id/accept` | `studentId` | 409 `offer_unavailable` |
| `PUT /v1/school/opening-hours` | `items[].branchId` | 404 `not_found` |
| `POST /v1/vehicles`, `PATCH /v1/vehicles/:id` | `branchId` | 404 `not_found` |
| `POST /v1/students` | `primaryInstructorMembershipId` | 400 `validation_error` |
| `POST /v1/leads/:id/convert` | `primaryInstructorMembershipId` | 400 `validation_error` |
| `PUT /v1/students/:id/instructors` | `instructors[].instructorMembershipId` | 400 `validation_error` |
| `POST /v1/students/:id/guardians` | `guardianUserId` (user without a membership here) | 404 `not_found` |
| `PUT /v1/students/:id/private-notes/:lessonId` | `:lessonId` | 404 `not_found` |

The default for a new route is 404 `not_found` (no existence leak); 400 `validation_error` with the
field path is kept where a field-level form error already existed. Not tenant data, so not listed:
`POST /v1/me/switch-school` `membershipId` (cross-school by design), platform `planId` /
`schoolId`, theory `questionId` (platform question packs). A new body field that carries an id
needs a row in that test.

New `SECURITY DEFINER` functions need an entry in `FUNCTIONS` in
`apps/api/test/db/security-definer.test.ts` (columns, grants, cross-school behaviour); the test scans
`apps/api/drizzle/*.sql` and `pg_proc` and fails on a function without one.

## Mock API for the frontends (`@driveos/shared/mocks`)

MSW handlers for every operation in `apps/api/openapi.json`. `pnpm generate` writes the route list
(`packages/shared/src/mocks/generated/routes.ts`, not committed), so a new or changed route is mocked
after the next generate. Fixture data copies the dev seed (`pnpm --filter @driveos/api db:seed`): Fahrschule Spree (Berlin)
and Escola de Condução Tejo (Lisbon), their staff, five Berlin students, catalogue and plans.

```ts
import { createMockApi, handlers, scenarios } from '@driveos/shared/mocks';

const api = createMockApi({
  seed: scenarios.loggedInAs('office'), // also owner, instructor, student, parent, platform_admin
  latencyMs: 300,
  now: () => new Date('2026-10-08T08:00:00Z'),
  baseUrl: '*', // default: any origin
});
// api.handlers → setupWorker (msw/browser), setupServer (msw/node or msw/native)
// api.store    → in-memory data; api.reset() → back to the seed
```

`handlers` (also the default export) is a ready instance with the owner (Otto) logged in.

Behaviour:

- Every route returns its documented success status. Bodies come from the stateful store
  (identity, school, catalogue, students, calendar and lessons, balance and ledger, staff, shop,
  current question pack) or from the DTO samples; the invoice PDF is a tiny PDF; 204 routes are empty.
- Request bodies are validated with the shared zod schemas → `400 validation_error`.
- Login: `POST /v1/auth/code` → 202 for anything valid; `POST /v1/auth/verify` with code `000000`
  and a seeded phone or email (e.g. `otto.owner@example.com`, `+4915550000006` for Stella Student,
  `ines.ferreira@example.com` for Lisbon) → tokens and memberships. Refresh,
  logout, `GET /v1/me` and `POST /v1/me/switch-school` follow the session.
- Requests without `Authorization` use the store's current session (last login or scenario); an
  unknown token → `401 unauthenticated`. Data is scoped to the active membership's school;
  another school's ids → 404. The mocks do not check permissions.
- Lessons: booking checks instructor, vehicle and student overlaps → `409 lesson_conflict`, checks
  the balance (`409 insufficient_balance` unless the school allows negative balances) and debits
  the ledger; cancelling inside `cancellationWindowHours` is late (no restore), otherwise the
  minutes are restored; staff cancels always restore unless owner/office send
  `restoreCredit: false` inside the window, and students/parents sending `restoreCredit` get `400`.
  Complete and no-show need a booked lesson but, unlike the API, do not refuse a lesson that has
  not started yet. A
  stale `version` → `409 version_conflict` with `details.serverVersion`. Each student starts with a 600-minute purchase.
- `Idempotency-Key` on the six SPEC §8 routes: missing → 400 `idempotency_key_required`, same key
  and body → the stored response, same key and another body → 422 `idempotency_key_reused`.
- Invitations: `POST /v1/invitations` returns an `acceptToken`; accepting creates the membership,
  and the invited contact can then log in with `000000`.

Admin: set `VITE_USE_MOCKS=true` in `apps/admin/.env`; the dev server serves the MSW worker script
and `main.tsx` starts it before rendering. Mobile: set `EXPO_PUBLIC_USE_MOCKS=true` in
`apps/mobile/.env`; `app/_layout.tsx` starts `msw/native`. Tests use `setupServer` from `msw/node`.
