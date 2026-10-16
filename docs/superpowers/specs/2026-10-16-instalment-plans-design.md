# Instalment plans and deposits — design

Status: draft for review. Source: `.context/reports/DriveOS premium features.md` §2. Builds on `main` as of 2026-10-16 (Phase 1 + the enrolment page feature).

## 1. Intent

A category B course costs about €400 and most families in Albania and Kosovo pay it in parts, today in cash and from memory. DriveOS turns that habit into a schedule the school and the learner can both see: a deposit plus a few dated instalments, each of which releases its share of lesson credits when it is paid, each reminded before it is due, and each invoiced on its own. The school stops chasing by phone, the learner always knows what is owed, and every part-payment is recorded and measurable.

Who it serves: the school owner and office (set up and collect), the student or parent (see what is due, pay in the app or at the desk), and DriveOS (Pro feature; later a take rate on the card part).

## 2. Goals, non-goals, anti-goals

Goals
- A school can sell any `package` price item on a plan: deposit now, N instalments on dates.
- Each instalment can be paid by card link (in-app checkout), cash or bank transfer at the desk.
- Credits are released proportionally per paid instalment; the no-negative-balance rule still holds.
- Reminders go out before each due date; overdue instalments put a hold on new bookings by the student (staff can override).
- Each paid instalment gets its own invoice; nothing is pre-invoiced.
- Staff and the learner can see the plan, what is paid, what is due, what is overdue.
- The growth report shows instalment revenue collected and the overdue amount.

Non-goals
- No lending: the school carries the credit risk; DriveOS does not finance anything.
- No automatic card charging (no stored cards). Each card instalment is a fresh checkout link the learner opens.
- No interest, late fees or surcharges computed by DriveOS. A school may set a plan price higher than the one-off price by using a separate price item; DriveOS does not add anything.
- No take rate yet (Phase 2 per SPEC); the design keeps the card amounts measurable so it can be added.

Anti-goals (would make it a failure)
- A learner who has paid gets fewer credits than their money bought, or a learner who has not paid can book on credit without a staff decision.
- Two invoices or two credit releases for one instalment (retries, double clicks, webhook replays).
- A plan that cannot be reconstructed from the ledger and invoices after the fact.

## 3. Constraints (project rules that bind this)

- Money is integers in minor units with a currency on every row; credits are an append-only ledger of signed minutes; never a stored balance.
- Bookings take the per-student ledger lock before checking the balance (existing behaviour; the hold is an extra check in the same place).
- Issued invoices are immutable; corrections are credit notes.
- `Idempotency-Key` on every write that moves money or credits.
- Command handlers write their own tables and the outbox only; notifications and reminders come from subscribers and jobs.
- Pro plan feature: `plans.features` must contain `instalment_plans` for a school to create plans (same mechanism as `enrolment_page`).

## 4. How it works

### 4.1 Vocabulary

- **Plan template**: a school-defined way to split a price item: "10-lesson package: 30% deposit, then 3 monthly instalments". Owned by the school, reusable.
- **Instalment plan**: one learner's instance of a template on one price item: a fixed total, a list of instalments with amounts and due dates, a status.
- **Instalment**: one dated amount within a plan; paid by exactly one payment; releases a fixed number of credit minutes.

### 4.2 Data (billing module)

`instalment_plan_templates` — `id, school_id, name, price_item_id, deposit_bp (basis points of the total), instalment_count (1–12), interval_days (7–60), active, version`.

`instalment_plans` — `id, school_id, student_id, price_item_id, template_id (nullable; a staff member may build a custom split), total_minor, currency, total_credit_minutes, status (active | completed | cancelled), booking_hold (boolean, derived but stored for the inbox), created_by_membership_id, created_at, completed_at, cancelled_at, version`.

`instalments` — `id, school_id, plan_id, sequence (1..n), amount_minor, currency, credit_minutes, due_on (date, school local), status (due | paid | overdue | waived), payment_id (nullable, set when paid), paid_at, reminder_sent_at, version`. Unique `(plan_id, sequence)`. Sum of `amount_minor` equals the plan's `total_minor`; sum of `credit_minutes` equals `total_credit_minutes` (rounding goes to the last instalment).

`payments` gains `instalment_id` (nullable). `ledger_entries` already link to `payment_id`; a release is a normal `purchase` credit with `priceItemId` and `paymentId`.

Rounding rule (pure domain function `splitPlan(total, creditMinutes, depositBp, count)`): deposit = round(total × depositBp / 10000); the remainder is split equally with any remainder cents on the last instalment; credit minutes likewise, proportional to amount.

### 4.3 Commands (billing)

- `CreatePlanTemplate`, `UpdatePlanTemplate` (owner/office with `prices.manage`).
- `StartInstalmentPlan(actor, studentId, priceItemId, templateId | customSplit, firstDueOn)` (`instalments.manage`, office/owner): computes the schedule with `splitPlan`, writes plan + instalments (all `due`), appends `InstalmentPlanStarted`. Requires the `instalment_plans` feature. The deposit's `due_on` is today.
- `PayInstalmentAtDesk(actor, instalmentId, method cash | bank_transfer, reference?)` with `Idempotency-Key`: locks the plan row and the student ledger, refuses if the instalment is not `due`/`overdue` (409 `instalment_not_payable`), creates the `payments` row (`method`, `instalment_id`), issues the invoice for that instalment (description "Package X — instalment 2 of 4"), credits the ledger with the instalment's minutes, marks the instalment `paid`, completes the plan when all are paid, appends `InstalmentPaid` (+ `InstalmentPlanCompleted`), and reuses the existing `CashPaymentRecorded`, `InvoiceIssued`, `LedgerEntryRecorded` events.
- `StartInstalmentCheckout(actor, instalmentId)` (student/parent/staff): like `StartCheckout` but for the instalment's amount; the `payments` row carries `instalment_id`. The existing webhook handler, on success, sees `instalment_id` and takes the instalment path (invoice for the instalment, release its minutes, mark paid) instead of the price-item path. Webhook replays are already idempotent on payment status.
- `WaiveInstalment(actor, instalmentId, reason)` (owner only): marks `waived`, releases its credits anyway (the school chooses to give them), appends `InstalmentWaived`; audited.
- `CancelInstalmentPlan(actor, planId, reason)` (owner/office): only unpaid instalments are cancelled; paid ones stay as they are (their invoices and credits stand); appends `InstalmentPlanCancelled`.
- `MarkOverdueInstalments(now)` — per-school daily job at 06:00 local: every `due` instalment with `due_on < today` becomes `overdue`, the plan's `booking_hold` becomes true, appends `InstalmentOverdue` per instalment. Paying any overdue instalment clears the hold when no overdue instalments remain.

### 4.4 Booking hold (scheduling ↔ billing)

`billing.LedgerWriter` (same-transaction service) gains `bookingHold(studentId): Promise<{ held: boolean; overdueMinor: number; currency: string }>`. `BookLesson` and `AcceptSlotOffer` call it right after `lockStudent`; when `held` and the booking is the student's or parent's own, they throw 409 `instalment_overdue`; staff bookings proceed (the hold is a nudge, not a lock, for staff) but the response carries `warnings: ['instalment_overdue']`. Mobile shows the overdue banner with a "Pay now" button that opens the instalment checkout.

### 4.5 Reminders and notifications (messaging)

Templates: `instalment_due_soon` (3 days before `due_on`, to the student's and guardians' users, push or email, dedupe key `instalment_due_soon:<instalmentId>`), `instalment_overdue` (on the day it turns overdue, same recipients + the office), `instalment_paid` (receipt, student/guardians). The daily job at 06:00 local emits `InstalmentDueSoon` for instalments due in 3 days; messaging subscribes to it and to `InstalmentOverdue`/`InstalmentPaid`.

### 4.6 Queries and API

| Route | Who | Notes |
| --- | --- | --- |
| `GET/POST/PATCH /v1/instalment-templates` | `prices.read` / `prices.manage` | |
| `POST /v1/students/{id}/instalment-plans` | `instalments.manage` | `Idempotency-Key` |
| `GET /v1/students/{id}/instalment-plans` | `instalments.read` or own | plan with instalments, paid/due/overdue totals |
| `GET /v1/instalment-plans?status=&overdue=true` | `instalments.read` | the money inbox view |
| `POST /v1/instalments/{id}/pay` | `payments.cash.record` | desk payment, `Idempotency-Key` |
| `POST /v1/instalments/{id}/checkout` | `checkout.create` | card link |
| `POST /v1/instalments/{id}/waive` | owner | `Idempotency-Key` |
| `POST /v1/instalment-plans/{id}/cancel` | `instalments.manage` | |
| `GET /v1/me` | — | `features` already there |

New permissions: `instalments.read` (owner, office, instructor for own students: read only), `instalments.manage` (owner, office). Students and parents read their own plans through the student routes.

### 4.7 Reporting

`rm_school_metrics_daily` gains `instalment_collected_minor` (paid instalments by day), `instalment_overdue_minor` (snapshot written by the daily job: sum of overdue amounts that day). Growth report gains `instalmentCollectedMinor`, `instalmentOverdueMinor`, `plansStarted`, `plansCompleted`.

### 4.8 Clients

Admin: a "Payment plans" tab on the student profile (start a plan from a template or custom split, see the schedule, pay at desk, waive, cancel); a "Due & overdue" section in the money inbox with one-click desk payment; template management under Price items; growth report rows. Mobile (student and parent): the balance screen shows the plan with the next due instalment and a "Pay now" button (existing checkout flow), an overdue banner, and payment receipts in the ledger list.

### 4.9 Invoices

Each instalment is its own invoice with the price item's tax rate, description "{package name} — instalment {n} of {count}", and a line referencing the price item. The plan id goes into the invoice's internal reference so an accountant can group them. When fiscalisation lands (separate design), each instalment invoice is fiscalised on issue like any other.

## 5. Decisions taken (my calls, correct me)

- Credits release per paid instalment, proportional to amount. A school that wants all credits up front should not use a plan.
- Overdue hold applies to self-service bookings only; staff can still book and are warned. (The report proposes "automatic holds"; a hard block on staff would stop a school from serving a learner who is paying cash at the desk the same day.)
- No partial payment of an instalment. Pay the whole instalment or wait.
- Templates are per price item, so the credit minutes always come from the item.
- Reminders at 3 days before; the number is a school setting later if asked.
- Instalment checkout uses the existing `PaymentProvider`; with the fake provider in dev and the local acquirer when it lands.

## 6. Left to the builder

File names and handler shapes following the billing module's patterns; the exact admin layout; migration numbering; test fixtures. Everything in §4 is required.

## 7. Testing

Domain: `splitPlan` rounding (sums always equal totals; one-instalment plans; 12 instalments; minutes rounding). Handlers: start, desk pay (idempotent replay, double pay 409), checkout + webhook on an instalment (release once on replay), waive, cancel, overdue job and hold, hold enforcement in `BookLesson` for own vs staff. Projection and growth report. Cross-tenant fixtures for every route. Admin component tests for the plan tab and inbox; Playwright mock scenario (start plan → pay deposit at desk → instalment overdue banner). Mobile flow helper tests.
