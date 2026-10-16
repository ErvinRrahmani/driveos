# Instalment plans — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a school sell a package as a deposit plus dated instalments, each paid by card link or at the desk, each releasing its share of credits and getting its own invoice, with reminders, an overdue booking hold, and growth-report numbers.

**Architecture:** Everything money-related lives in the billing module (templates, plans, instalments) on top of the existing payments, invoices and ledger; scheduling asks billing's same-transaction `LedgerWriter.bookingHold` before a self-service booking; messaging and reporting consume new events; admin and mobile read the plan through new billing routes.

**Tech Stack:** as the repo (NestJS CQRS, Drizzle + drizzle-kit, zod v4 DTOs in `packages/shared`, Vitest, React admin, Expo mobile, MSW mocks, Playwright).

**Spec:** `docs/superpowers/specs/2026-10-16-instalment-plans-design.md` (read it first, including §8 "Decisions from the builder check"; this plan argues from it).

## Global Constraints

- TypeScript `strict`; zod v4 only; `StatusCodes`/`ReasonPhrases` from `http-status-codes` everywhere (front and back, tests and mocks).
- Money: integers in minor units with a currency on every row; credits only through `LedgerWriter` (append-only); never a stored balance; `lockStudent` before any balance check; `Idempotency-Key` on every route that moves money or credits (`POST /v1/students/{id}/instalment-plans`, `POST /v1/instalments/{id}/pay`, `POST /v1/instalments/{id}/checkout`, `POST /v1/instalments/{id}/waive`).
- Every new tenant table: `school_id uuid not null`, RLS enabled and forced, one `<table>_tenant` policy with the exact `TENANT_PREDICATE` from `apps/api/test/db/rls.test.ts`; listed in `apps/api/test/db/spec-tables.ts`.
- Command handlers write own tables + outbox only; no notifications or jobs from handlers; subscribers idempotent.
- Modules talk only through `index.ts` exports, events, or the same-transaction services listed in SPEC §3.4 (`LedgerWriter` gains `bookingHold`).
- Issued invoices immutable; corrections are credit notes.
- Every new route: `@ApiRoute`, permission decorator, row in `apps/api/test/support/spec-routes.ts`, cross-tenant fixture, CONTRACTS entry; new DTO schemas need samples; new events go in the catalogue, samples and `SPEC_EVENTS`.
- Migrations via drizzle-kit (schema `generate --name …`, SQL `generate --custom --name …`); never edit a migration on `main` (0000–0035 exist).
- All user-facing strings through i18n (`en` only in this plan; the Albanian plan translates later).
- Gate before every commit: `pnpm generate && pnpm lint && pnpm typecheck && pnpm test`, `db:reset && db:seed` green. Executors never run git; the controller commits.
- Commits carry no attribution trailers; author Ervin Rrahmani.

## Review Focus

1. A card checkout and a desk payment for the same instalment must never both release credits or both issue an invoice (Task 3: concurrent-payment test, `unapplied` path).
2. A webhook replay or a double click on "Pay at desk" must be a no-op (Task 3: idempotency tests).
3. Rounding: for every plan the instalment amounts sum to the price item amount and the minutes to the item's minutes, including 12-way splits of odd totals (Task 2: property-style domain test over many inputs).
4. The overdue hold blocks a student's or parent's booking but only warns on a staff booking; paying any overdue instalment lifts it (Task 5).
5. A refund of an instalment payment reopens the instalment and never removes more minutes than that instalment released (Task 3).

---

### Task 1: Plan feature and permissions

**Files:**
- Modify: `packages/shared/src/dto/platform.ts` (`PLAN_FEATURES` + `'instalment_plans'`), `apps/api/scripts/db/seed-data.ts` (Standard plan features), `packages/shared/src/mocks/fixtures/schools.ts` (`PLAN_FIXTURES`), `apps/api/src/modules/identity/domain/permissions.ts` (+ `instalments.read`, `instalments.manage`, `instalment_templates.manage`; OFFICE gets `instalments.read`, `instalments.manage`; INSTRUCTOR gets `instalments.read` scoped by the existing "sees the student" rule), `apps/admin/src/lib/permissions.ts`, `apps/mobile/src/lib/permissions.ts`, `apps/api/test/identity/domain/permissions.test.ts`, `docs/CONTRACTS.md`.
- Test: `apps/api/test/platform/plan-features.test.ts` (extend: the enum accepts the new slug), permission role tests.

**Interfaces:** Produces `PlanFeature` includes `'instalment_plans'`; `Permission` includes the three new names.

- [ ] Add the enum value, permissions and role mappings; update tests; gate.

---

### Task 2: Billing schema, domain split, templates, plan start and reads

**Files:**
- Modify: `apps/api/src/modules/billing/infra/schema.ts`, `packages/shared/src/dto/billing.ts`, `packages/shared/src/dto/enums.ts`, `packages/shared/src/dto/samples/billing.ts`, `packages/shared/src/events/billing.ts`, `catalogue.ts`, `samples.ts`, `packages/shared/test/event-catalogue.test.ts`, `apps/api/src/modules/billing/billing.module.ts`, `index.ts`, `apps/api/test/support/spec-routes.ts`, `apps/api/test/billing/route-fixtures.ts`, `apps/api/test/db/spec-tables.ts`, `docs/CONTRACTS.md`
- Create: generated migration `instalment_plans` + custom `instalment_plans_rls`; `domain/instalments.ts` (`splitPlan`, `planStatusAfter`, `holdAfter`); `commands/create-instalment-template.{command,handler}.ts`, `update-instalment-template…`, `start-instalment-plan…`; `queries/list-instalment-templates…`, `get-student-instalment-plans…`, `list-instalment-plans…`; `http/instalment-templates.controller.ts`, `http/instalment-plans.controller.ts`; `infra/instalment-records.ts`
- Test: `apps/api/test/billing/domain/instalments.test.ts`, `apps/api/test/billing/instalment-plans-http.test.ts`

**Interfaces (produces):**
- Tables per spec §4.2 (`instalment_plan_templates`, `instalment_plans` with `booking_hold`, `instalments` with unique `(plan_id, sequence)` and nullable unique `payment_id`), `payments.instalment_id` (nullable FK), `payments.unapplied boolean not null default false`.
- `splitPlan({ totalMinor, creditMinutes, depositBp, count, firstDueOn, intervalDays }) → { amountMinor, creditMinutes, dueOn }[]` (deposit first, remainder cents and minutes on the last instalment, sums exact).
- DTOs: `instalmentTemplateSchema`, `createInstalmentTemplateRequestSchema`, `updateInstalmentTemplateRequestSchema`, `instalmentSchema` (`id, sequence, amountMinor, currency, creditMinutes, dueOn, status, paymentId, paidAt`), `instalmentPlanSchema` (`id, studentId, priceItemId, priceItemName, templateId, totalMinor, currency, totalCreditMinutes, status, bookingHold, paidMinor, dueMinor, overdueMinor, nextDueOn, instalments[], version`), `startInstalmentPlanRequestSchema` = `{ priceItemId, templateId } | { priceItemId, custom: { instalments: { amountMinor, dueOn }[] } }` (total must equal the item amount; validated in the handler), `instalmentPlanListResponseSchema` (cursor paging; filters `status`, `overdue=true`).
- Events v1: `InstalmentPlanStarted { planId, studentId, priceItemId, totalMinor, currency, instalmentCount }`, `InstalmentPlanCompleted { planId, studentId }`, `InstalmentPlanCancelled { planId, studentId, reason }`, `InstalmentPaid { planId, instalmentId, studentId, sequence, amountMinor, currency, creditMinutes, paymentId, invoiceId, invoiceNumber }`, `InstalmentOverdue { planId, instalmentId, studentId, sequence, amountMinor, currency, dueOn }`, `InstalmentDueSoon { planId, instalmentId, studentId, sequence, amountMinor, currency, dueOn }`, `InstalmentWaived { planId, instalmentId, studentId, creditMinutes, reason }`, `PaymentUnapplied { paymentId, instalmentId, studentId, amountMinor, currency }` (aggregate `instalment_plan`, version per plan; `PaymentUnapplied` on aggregate `payment`).
- Commands exported: `StartInstalmentPlanCommand(actor, studentId, body)` → `{ id, version }`; requires the `instalment_plans` feature (403 `feature_not_in_plan`), price item active and of kind `package` or `lesson`, student exists.
- Queries exported: `GetStudentInstalmentPlansQuery(actor, studentId)`, `ListInstalmentPlansQuery(params)`, `ListInstalmentTemplatesQuery`.
- Routes: `GET/POST/PATCH /v1/instalment-templates` (`prices.read` / `instalment_templates.manage`), `POST /v1/students/{id}/instalment-plans` (`instalments.manage`, `@Idempotent()`), `GET /v1/students/{id}/instalment-plans` (`instalments.read` or own student/parent via the existing `StudentAccess` rules), `GET /v1/instalment-plans` (`instalments.read`).

- [ ] Domain tests first (sums, deposit 0% and 100%, 1 and 12 instalments, odd cents, minutes rounding, dates every `intervalDays`), then HTTP tests (start from template, custom split equal/unequal totals → 400, feature missing → 403, cross-tenant), then implement; gate.

---

### Task 3: Paying instalments: desk, card, webhook, waive, cancel, refund

**Files:**
- Create: `commands/pay-instalment-at-desk…`, `start-instalment-checkout…`, `waive-instalment…`, `cancel-instalment-plan…`, `expire-instalment-checkouts…` (internal), `http/instalments.controller.ts`
- Modify: `commands/handle-payment-webhook.handler.ts` (instalment path + unapplied), `commands/issue-refund.handler.ts` (instalment reopen + minutes cap), `infra/payment-events.ts` (`purchasePayload` takes the minutes to report; optional `instalmentId`), `packages/shared/src/events/billing.ts` (`CashPaymentRecorded`/`PaymentSucceeded`/`PaymentFailed` + optional `instalmentId`; `creditMinutes` semantics documented), `infra/invoice-issuer.ts` (description + plan reference), `infra/ledger-writer.ts` + `ledger-writer.impl.ts` (`bookingHold`), `index.ts`, `spec-routes.ts`, route fixtures, `foreign-ids.test.ts` (none new: ids are path params), CONTRACTS
- Test: `apps/api/test/billing/instalment-payments.test.ts` (desk pay idempotent replay and 409 on second pay; card checkout → fake webhook → release once, replay no-op; pending checkout blocks a second checkout (409 `instalment_checkout_pending`); desk pay while a checkout is pending cancels it; a late success webhook for a cancelled checkout → `unapplied`, no credits, no invoice, `PaymentUnapplied`; waive releases credits and audits; cancel leaves paid instalments; refund reopens and caps minutes; plan completes on last payment; `bookingHold` true only with an overdue instalment)

**Interfaces (produces):** `LedgerWriter.bookingHold(studentId) → { held: boolean; overdueMinor: number; currency: string }`; error codes `instalment_not_payable`, `instalment_checkout_pending`, `instalment_overdue` (used by scheduling), `plan_not_cancellable`; routes `POST /v1/instalments/{id}/pay` (`payments.cash.record`, `@Idempotent()`), `POST /v1/instalments/{id}/checkout` (`checkout.create`), `POST /v1/instalments/{id}/waive` (owner: `instalments.manage` + role check, `@Idempotent()`), `POST /v1/instalment-plans/{id}/cancel` (`instalments.manage`).

- [ ] Tests first for every bullet above; implement; gate.

---

### Task 4: Daily job: overdue, due-soon, checkout expiry

**Files:**
- Create: `apps/api/src/modules/billing/infra/instalment-day.job.ts` (`billing.instalment-day`, cron every hour; per school runs only when the school's local time is between 06:00 and 06:59 and the job has not run for that local day — copy the local-day pattern from `reporting/domain/growth.ts` `growthMonthDue`; store the last run day in a small `billing_job_runs(school_id, job, last_day)` tenant table or in `instalment_plans` metadata — choose the table), `commands/mark-instalments-overdue…`, `commands/emit-instalments-due-soon…`
- Modify: `billing-worker.module.ts`, CONTRACTS, `docs/OPERATIONS.md` §6
- Test: `apps/api/test/billing/instalment-day-job.test.ts` (overdue transition + hold + event; due in 3 days → `InstalmentDueSoon` once; pending checkouts older than 2 h expire; idempotent on a second run the same day; runs per school in local time)

- [ ] Tests first; implement; gate.

---

### Task 5: Booking hold in scheduling

**Files:**
- Modify: `apps/api/src/modules/scheduling/commands/book-lesson.handler.ts`, `accept-slot-offer.handler.ts`, `packages/shared/src/dto/scheduling.ts` (`LessonResponse.warnings?: ('instalment_overdue')[]` on the booking response), samples, `apps/api/src/kernel/i18n/locales/en.json` (`errors.instalment_overdue`), CONTRACTS
- Test: `apps/api/test/scheduling/booking-hold.test.ts` (student booking with an overdue instalment → 409 `instalment_overdue`; parent → 409; office → 201 with `warnings: ['instalment_overdue']`; after paying the overdue instalment → 201 without warnings; offer accept same)

- [ ] Tests first; implement; gate.

---

### Task 6: Reporting and messaging

**Files:**
- Modify: reporting `infra/schema.ts` (`rm_school_metrics_daily` + `instalment_collected_minor`, `instalment_overdue_minor`, `plans_started`, `plans_completed`; `growth_reports` + the same), `domain/metrics.ts` (keys + contributions from `InstalmentPaid`, `InstalmentPlanStarted/Completed`, `InstalmentOverdue` snapshot via the daily job's `InstalmentOverdueSnapshot` event — add it to Task 4's job: `{ overdueMinor, currency, day }`), `domain/growth.ts`, `infra/growth-reports.ts`, `infra/report-rows.ts`, `projections/school-metrics.projection.ts`, `packages/shared/src/dto/reporting.ts` + sample + mocks; messaging `domain/templates.ts` (+ `instalment_due_soon`, `instalment_overdue`, `instalment_paid`; `invoice_issued` suppressed when the `InvoiceIssued` payload carries `instalmentId` — add that field to the event in Task 3), `subscribers/instalment-notifications.subscriber.ts`, `messaging-worker.module.ts`, `en.json`, CONTRACTS
- Test: projection test (`apps/api/test/reporting/instalment-attribution.test.ts`), subscriber test (`apps/api/test/messaging/instalment-notifications.test.ts`: recipients = student + guardians (+ office for overdue), dedupe keys, quiet hours, no `invoice_issued` for an instalment invoice)

- [ ] Tests first; implement; gate.

---

### Task 7: Admin

**Files:**
- Create: `apps/admin/src/components/students/instalments-tab.tsx` (plan cards: schedule table with status badges, "Pay at desk", "Waive", "Cancel plan", "Start plan" dialog with template select or custom rows), `apps/admin/src/components/price-items/instalment-templates.tsx` (CRUD under Price items), `apps/admin/src/components/billing/due-instalments.tsx` (section on the `/payments` page: due this week and overdue, one-click desk payment with Idempotency-Key), `apps/admin/test/components/instalments.test.tsx`, `apps/admin/e2e/tests/instalments.spec.ts` + page object
- Modify: `apps/admin/src/lib/students.ts` (`STUDENT_TABS` + `instalments`, permissions map), `student-profile.tsx`, `routes/_app/payments.tsx`, `routes/_app/price-items.tsx`, `components/reports/growth-history.tsx` (+ columns), `apps/admin/src/locales/en.json`, `packages/shared/src/mocks/*` (templates, plans, instalments collections with pay/checkout/waive/cancel resolvers; Berlin seeded with one active plan with an overdue instalment for Sofia)
- Gating: tab and templates hidden without `instalment_plans` in `me.active.features`.

- [ ] Component tests and the Playwright spec first (start a plan from a template, pay the deposit at the desk, see the overdue badge); implement; `pnpm --filter @driveos/admin test` + `test:e2e`; gate.

---

### Task 8: Mobile

**Files:**
- Create: `apps/mobile/src/screens/student/instalments.tsx` + route `app/(student)/student/(home)/instalments.tsx` (plan list, next due, "Pay now" → `POST /v1/instalments/{id}/checkout` → `openBrowserAsync`), `apps/mobile/src/lib/instalment-flow.ts` (pure: next due instalment across plans, banner state, payable check), `apps/mobile/test/student/instalment-flow.test.ts`
- Modify: `src/screens/student/balance.tsx` (plan summary card + overdue banner linking to the screen), `src/screens/student/home.tsx` (overdue banner), parent screens mirror (`apps/mobile/src/screens/parent/*` where the balance is shown), `src/lib/student-data.ts` (`useInstalmentPlans`), `(home)/_layout.tsx` (screen title), `src/locales/en.json`, push target for `instalment_*` templates → the instalments screen
- The booking screen shows the 409 `instalment_overdue` as a banner with "Pay now".

- [ ] Flow tests first; implement; `pnpm --filter @driveos/mobile test`; gate.

---

### Task 9: Seed, docs, final gate

**Files:**
- Modify: `apps/api/scripts/db/seed-data.ts` + `seeder.ts` (Fahrschule Spree: one template "10-lesson package in 4", one active plan for Sofia with the deposit paid at the desk (payment, invoice, ledger rows) and instalment 2 overdue; `booking_hold = true`), `docs/SPEC.md` (§2 premium list, §3.6 events, §5/§6.1 tables, §8 routes incl. Idempotency-Key list, §11 D14 instalments decisions), `docs/OPERATIONS.md` (§6 job, §10 seed, §11 gaps), `docs/CONTRACTS.md` consistency, `docs/TASKS.md` section, `apps/admin/e2e/real-api/instalments.spec.ts` (`@real-api`: office starts a plan for Arta-like fixture, pays deposit, sees credits on the student)
- Gate: full gate + `db:reset`/`db:seed` + mock e2e + real-API e2e with servers started and stopped as in the enrolment plan.

- [ ] Do it; gate.

---

## Delivery order

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9, one commit per task after review on branch `feature/instalment-plans`, merged to `main` at the end with the same no-trailer rule.
