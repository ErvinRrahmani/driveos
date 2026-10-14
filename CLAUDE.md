# DriveOS — project context for coding agents

DriveOS is a multi-tenant SaaS for **driving schools**. A school subscribes and runs its business on it (calendar, instructors, cars, students, payments). Every student enrolled at that school gets the student app free, through the school. Students never pay the platform directly. There is no public marketplace.

Business principle: **they grow, we grow.** DriveOS earns from a small base subscription plus a per-student fee (later a small cut of in-app payments), so features that help schools earn more (prepaid packages, upsells, fill-the-gap offers, the monthly growth report) are first-class, and every money flow must be measurable per school.

Full spec: `docs/SPEC.md`. Work plan and workspace prompts: `docs/TASKS.md`. Before writing code, read this file, SPEC §3 (architecture) and the spec sections for your module. The default branch is `master`.

## Stack (do not change without asking)

- **TypeScript `strict` everywhere, front and back.** Node.js LTS (24.x). pnpm workspaces + Turborepo.
- `apps/api` — NestJS with `@nestjs/cqrs`, PostgreSQL 16, Drizzle ORM + drizzle-kit migrations, Redis + BullMQ for delayed and scheduled jobs, zod v4 as the only validation library (requests, env config, tokens, events, DTOs; no class-validator, joi or yup), `http-status-codes` for HTTP status codes, OpenAPI via `@nestjs/swagger`. Two entry points: `main.ts` (HTTP) and `worker.ts` (outbox relay, event subscribers, projections, BullMQ processors).
- `apps/admin` — school admin web app: React 19 + Vite, TanStack Router (file-based routes, typed search params), TanStack Query, TanStack Table, TanStack Form, Tailwind + shadcn/ui.
- `apps/mobile` — one Expo (React Native) app with expo-router and role-based navigation (student, instructor, parent), TanStack Query for server state. The instructor diary works offline with expo-sqlite. (TanStack Router does not support React Native, so mobile uses expo-router.)
- `packages/shared` — zod schemas for request/response DTOs and event payloads, shared types, and the API client + TanStack Query hooks generated from the OpenAPI document.
- `docker-compose.yml` — Postgres, Redis, MinIO (S3), Mailpit (email). Runs on OrbStack.

## Architecture: CQRS without event sourcing (details in SPEC §3)

- Writes are **commands**, reads are **queries**. Controllers only validate input and call `CommandBus.execute` (POST/PUT/PATCH/DELETE) or `QueryBus.execute` (GET).
- A command handler runs inside the request's tenant transaction. It changes only its own module's tables and appends domain events to the `outbox` table **in the same transaction**. It returns the new id and version, not a read model.
- A query handler never writes. It reads its own module's tables or a read model (`rm_*`). Read models are built by projections from outbox events and are eventually consistent. Anything that must be exact *now* (credit balance, clash checks, invoice totals) reads write tables.
- Modules talk to each other only through another module's public commands/queries on the bus, through events, or through the same-transaction services listed in SPEC §3.4. Never import another module's tables or repositories.
- Never enqueue a job or send a notification from a command handler. Emit an event; a subscriber in the worker does it after commit.
- Every subscriber and projection is idempotent (event id recorded per subscriber) and ignores events older than what it has already applied (`aggregate_version`).

## Rules that must never be broken

1. **Tenant isolation.**
   - Every tenant table has `school_id uuid not null`, with RLS enabled **and forced** (`FORCE ROW LEVEL SECURITY`). The app connects as `app_rw`, which is not the table owner.
   - Every request and every per-school job runs in a transaction that calls `set_config('app.school_id', $1, true)` and `set_config('app.user_id', $2, true)`. Never build a `SET LOCAL` string.
   - Policies read `nullif(current_setting('app.school_id', true), '')::uuid`.
   - Never take `school_id` from the client; it comes from the access token.
   - Flows that have no school yet (login, invitation accept, `GET /v1/me`, payment webhooks) use only the named `SECURITY DEFINER` functions in SPEC §6.2.
   - The `app_system` role bypasses RLS. Only the outbox relay, cross-school schedulers and platform billing use it. Request handlers never use it, and neither does support access.
2. **No double-booking.**
   - Lessons use a `tstzrange` column and `EXCLUDE USING gist` constraints for instructor, vehicle and student overlaps (extension `btree_gist`).
   - Do not rely only on application checks.
   - Map constraint violations to `409 lesson_conflict`.
3. **Money.**
   - Amounts are integers in minor units, and every row that has an amount also has a currency.
   - Lesson credits are an append-only ledger (`ledger_entries`, signed minutes). Never store or update a balance.
   - A booking takes the per-student ledger lock before it checks the balance.
   - The write endpoints listed in SPEC §8 (payments, refunds, cash, adjustments, bookings, offer accept) require an `Idempotency-Key` header. Sync operations are idempotent on `op_id`.
   - Issued invoices are never edited or voided. Corrections are credit notes.
4. **External services behind adapters.** Payments, SMS, push, email, storage, question-bank import, invoice policy/PDF and exam rules each have an interface plus a fake/dev implementation. Never call a provider SDK outside its adapter.
5. **Privacy.**
   - Students may be under 18. Decide whether a student is a minor from `students.date_of_birth` and the school's `age_of_majority`.
   - Documents go to encrypted object storage via short-lived signed URLs.
   - Log staff reads of student records and documents, and all support access, in `audit_log`.
   - Deleting a student anonymizes them. Financial records are kept.
6. **Phase 1 scope only** unless the task says otherwise (see spec §2). Do not build Phase 2/3 features early.

## Conventions

- **Module layout:** `apps/api/src/modules/<module>/{commands,queries,events,subscribers,projections,domain,infra,http}`.
  - `domain/` holds pure functions (cancellation rules, exam scoring, gap detection) with no Nest or DB imports.
  - `index.ts` exports only the module's public commands, queries and same-transaction services.
- **Naming:** commands are imperative (`BookLesson`), events are past tense (`LessonBooked`), queries are `Get…`/`List…`. Event payload schemas live in `packages/shared/src/events`, each with a zod schema and an integer `version`.
- **API:** REST under `/v1`, JSON, cursor pagination (`?cursor=&limit=`), errors as `{ error: { code, message, details? } }`. HTTP status codes always use `StatusCodes` / `ReasonPhrases` from `http-status-codes` (front and back, including tests and mocks), never numeric literals or Nest's `HttpStatus`; ESLint enforces this.
- **Ids:** UUIDv7, generated by the server, or by the client for records created offline.
- **Times:** stored in UTC (`timestamptz`). Each school has an IANA time zone for display. Weekly availability and opening hours are local wall-clock times in that zone.
- **i18n:** all user-facing strings, including notification templates and PDFs, go through i18n (`en` first; more languages later).
- **Tests:** Vitest.
  - Unit tests for `domain/`.
  - Handler and API tests against the compose database.
  - Every new route must pass the generic cross-tenant route test from `cqrs-kernel`: a caller from school B must get 404/403.
- **Migrations:** drizzle-kit.
  - Anything drizzle can't express (EXCLUDE constraints, `SECURITY DEFINER` functions, grants, some policies) goes in custom SQL migrations.
  - Never edit a migration that is already on `master`.
  - When you rebase onto `master`, delete your branch's generated migrations and regenerate them.
- **Generated files:** the OpenAPI document and the API client are not committed. `pnpm generate` builds them, and Turbo runs it before `build`, `typecheck` and `test`.
- **Before finishing a task:**
  - `pnpm generate && pnpm lint && pnpm typecheck && pnpm test` pass.
  - Migrations apply on a fresh DB.
- **PRs:** keep each PR to one module, with base `master`. Describe what changed and how to test it.
