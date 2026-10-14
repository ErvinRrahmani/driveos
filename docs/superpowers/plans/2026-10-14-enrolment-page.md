# Enrolment page, lead inbox and review requests — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each school a public enrolment page whose leads land in an admin inbox, convert to students in one click, and show up in the growth report; ask passing students for a review and show approved reviews on the page.

**Architecture:** Each module owns its own tables and exposes commands/queries through its `index.ts`; the public page read composes bus queries from a school-less request after a `SECURITY DEFINER` slug lookup. New events (`LeadCaptured`, `LeadConverted`, `ReviewSubmitted`, `ReviewModerated`) feed the reporting projection and messaging subscribers through the outbox. Clients are the existing admin (React/TanStack) and mobile (Expo) apps.

**Tech Stack:** NestJS + `@nestjs/cqrs`, Drizzle + drizzle-kit (custom SQL migrations for the definer function and policies), zod v4 DTOs in `packages/shared`, Vitest, React 19 + TanStack Router/Query/Table/Form + shadcn/ui, Expo + expo-router, MSW mocks, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-enrolment-page-design.md` (read it first; this plan argues from it).

## Global Constraints

- TypeScript `strict`; zod v4 is the only validation library; HTTP statuses only via `StatusCodes`/`ReasonPhrases` from `http-status-codes` (ESLint enforces).
- Every new tenant table: `school_id uuid not null`, RLS enabled **and forced**, one `<table>_tenant` policy for ALL with the SPEC §6.1 predicate (`apps/api/test/db/rls.test.ts` checks it). Put the policy in a custom migration like `0004_grants_rls.sql` does.
- Never import another module's tables or infra; cross-module access only through `index.ts` commands/queries (ESLint `driveos/module-boundaries` and `test/architecture/module-boundaries.test.ts`).
- Command handlers write own tables + outbox only; never enqueue jobs or send notifications from a handler.
- Ids are UUIDv7 via `newId()` from `apps/api/src/kernel/db/columns.js`.
- Every new route: `@ApiRoute`, a permission decorator or `@Public()` + `@RateLimit`, a row in `apps/api/test/support/spec-routes.ts`, a cross-tenant fixture (or allowlist entry for public routes), and `pnpm generate` afterwards. Every public class exported from a module `index.ts` must be named in `docs/CONTRACTS.md` (`test/contracts/contracts-doc.test.ts`).
- New DTO schemas exported from `packages/shared/src/dto/<module>.ts` need a sample in `packages/shared/src/dto/samples/<module>.ts` (`dto-samples.test.ts`). New events go in `EVENT_CATALOGUE`, `EVENT_SAMPLES`, and the `SPEC_EVENTS` list in `packages/shared/test/event-catalogue.test.ts`.
- Migrations: `pnpm --filter @driveos/api exec drizzle-kit generate` for schema changes, `... generate --custom --name <name>` for SQL-only changes. Never edit a migration already on `main`.
- All user-facing strings go through i18n (`apps/api/src/kernel/i18n/locales/en.json`, `apps/admin/src/locales/en.json`, `apps/mobile/src/locales/en.json`).
- Gate before every commit: `pnpm generate && pnpm lint && pnpm typecheck && pnpm test` green from the repo root, and `pnpm --filter @driveos/api db:reset && pnpm --filter @driveos/api db:seed` succeed.
- Git: commit on `main` as configured in the worktree (author Ervin Rrahmani); push with `env -u GH_TOKEN git push origin main`. Executors never run git; the orchestrator commits after each task's review.

## Review Focus

1. A lead with `isMinor: true` but no guardian fields must be rejected with 400 before anything is written (Task 5 tests `captureLead` validation).
2. A second submission from the same phone within 30 days must not create a second lead but must append the new message to `note` (Task 5 dedupe test).
3. Converting an already converted lead, or double-clicking convert, must not create two students (Task 5 idempotency + 409 test).
4. The public page must return 404 for an unpublished slug and for a school whose plan lacks `enrolment_page`, and must never include a hidden or pending review (Task 2 tests).
5. A review request must go out once per student even if `TestAttemptRecorded` is delivered twice or the student passes twice (Task 7 dedupe test on `notifications.dedupe_key`).

---

### Task 1: Plan features and `/v1/me` features (platform + identity)

**Files:**
- Modify: `apps/api/src/modules/platform/infra/schema.ts` (plans), `packages/shared/src/dto/platform.ts`, `packages/shared/src/dto/samples/platform.ts`, `apps/api/src/modules/platform/queries/get-current-subscription.query.ts`, `.../get-current-subscription.handler.ts`, `apps/api/src/modules/platform/index.ts`
- Create: `apps/api/src/modules/platform/queries/school-has-feature.query.ts`, `.../school-has-feature.handler.ts`, `apps/api/src/modules/platform/domain/features.ts`
- Modify: `packages/shared/src/dto/identity.ts` (`meResponseSchema.active.features`), `apps/api/src/modules/identity/queries/get-me.handler.ts`, `apps/api/src/modules/platform/platform.module.ts`, `apps/api/scripts/db/seed-data.ts` (plan `standard` gets `features: ['enrolment_page']`), `packages/shared/src/mocks/fixtures/schools.ts` (`PLAN_FIXTURES` features), `docs/CONTRACTS.md` (platform section)
- Test: `apps/api/test/platform/plan-features.test.ts`, `packages/shared/test/dto-platform.test.ts`

**Interfaces:**
- Produces: `PLAN_FEATURES = ['enrolment_page'] as const`, `type PlanFeature`, `SchoolHasFeatureQuery(feature: PlanFeature) → boolean` (platform `index.ts`), `MeResponse.active.features: string[]`, `CurrentSubscription.features: string[]`.

- [ ] **Step 1: Write the failing tests**

`apps/api/test/platform/plan-features.test.ts` (follow `test/platform/*.test.ts` setup: `createScratchDatabase`, `createKernelTestApp`, `createTestTenants`):

```ts
it('SchoolHasFeatureQuery is true only when the active plan lists the feature', async () => {
  await tenants.asSystem((tx) =>
    tx.update(plans).set({ features: ['enrolment_page'] }).where(eq(plans.id, A.planId)),
  );
  expect(await executeAs(kernel.app, A, new SchoolHasFeatureQuery('enrolment_page'))).toBe(true);
  expect(await executeAs(kernel.app, B, new SchoolHasFeatureQuery('enrolment_page'))).toBe(false);
});

it('GET /v1/me carries the active plan features', async () => {
  const res = await http.get('/v1/me').set(authHeaders(A));
  expect(res.status).toBe(StatusCodes.OK);
  expect(res.body.active.features).toEqual(['enrolment_page']);
});

it('POST /v1/platform/plans accepts features and rejects unknown ones', async () => {
  const ok = await http.post('/v1/platform/plans').set(platformAdmin).send({ ...planBody, code: 'pro', features: ['enrolment_page'] });
  expect(ok.status).toBe(StatusCodes.CREATED);
  const bad = await http.post('/v1/platform/plans').set(platformAdmin).send({ ...planBody, code: 'x', features: ['teleport'] });
  expect(bad.status).toBe(StatusCodes.BAD_REQUEST);
});
```

(`A.planId`: check `test/support/tenants.ts` `TestTenant`; if it has no plan id, read it with `select plan_id from subscriptions where school_id = $1`.)

- [ ] **Step 2: Run them** — `pnpm --filter @driveos/api exec vitest run test/platform/plan-features.test.ts` → FAIL (column/query missing).

- [ ] **Step 3: Implement**

`packages/shared/src/dto/platform.ts`:
```ts
export const PLAN_FEATURES = ['enrolment_page'] as const;
export const planFeatureSchema = z.enum(PLAN_FEATURES);
export type PlanFeature = z.infer<typeof planFeatureSchema>;
// in planFields:
features: z.array(planFeatureSchema).max(20).default([]),
```
Add `features` to `updatePlanRequestSchema` and to the plan sample. Schema: `features: text('features').array().notNull().default([])` on `plans`; run `drizzle-kit generate` (name it `plan_features`).

`apps/api/src/modules/platform/domain/features.ts`:
```ts
import { PLAN_FEATURES, type PlanFeature } from '@driveos/shared';
export { PLAN_FEATURES, type PlanFeature };
export const hasFeature = (features: readonly string[], feature: PlanFeature): boolean =>
  features.includes(feature);
```

`school-has-feature.query.ts`:
```ts
export class SchoolHasFeatureQuery extends Query<boolean> {
  constructor(readonly feature: PlanFeature) { super(); }
}
```
Handler: run `GetCurrentSubscriptionQuery` logic (reuse the handler's select, add `features: plans.features`) and return `hasFeature(row.features, feature)`; `false` when no subscription.

`get-me.handler.ts` `scopeOf`: add `features` by executing `new GetCurrentSubscriptionQuery()` through the query bus when `this.tenant.schoolId === active.schoolId`, else `[]`. Extend `meResponseSchema.active` with `features: z.array(z.string())` and the identity sample / mock (`packages/shared/src/mocks/identity.ts` me resolver) accordingly.

Seed: `standard` plan gets `features: ['enrolment_page']`; `solo` gets `[]`. Update `PLAN_FIXTURES` the same way. Document `SchoolHasFeatureQuery` in `docs/CONTRACTS.md` under platform.

- [ ] **Step 4: Run** the test file, then `pnpm --filter @driveos/shared test`, then the full gate.
- [ ] **Step 5: Handoff** — note the migration name in `.context/handoff/premium-1-task-1.md`.

---

### Task 2: School public profile, reviews, slug lookup and public page read (school module)

**Files:**
- Modify: `apps/api/src/modules/school/infra/schema.ts` (+ `schoolPublicProfiles`, `schoolReviews`, enum `school_reviews_status`), `packages/shared/src/dto/school.ts`, `packages/shared/src/dto/samples/school.ts`, `packages/shared/src/dto/enums.ts` (`reviewStatusSchema`), `packages/shared/src/events/school.ts` (+ `ReviewSubmitted`, `ReviewModerated`), `packages/shared/src/events/catalogue.ts`, `packages/shared/src/events/samples.ts`, `packages/shared/test/event-catalogue.test.ts`, `apps/api/src/modules/school/school.module.ts`, `apps/api/src/modules/school/school-worker.module.ts`, `apps/api/src/modules/school/index.ts`, `apps/api/src/modules/identity/domain/permissions.ts` (+ `public_page.manage` owner-only, `reviews.moderate` owner+office, `reviews.submit` student), `apps/admin/src/lib/permissions.ts`, `apps/api/test/support/spec-routes.ts`, `apps/api/test/support/route-allowlist.ts`, `apps/api/test/school/route-fixtures.ts`, `apps/api/test/db/security-definer.test.ts` (FUNCTIONS + behaviour), `apps/api/test/db/spec-tables.ts` (new tables under `school`), `apps/api/src/kernel/http/rate-limit.decorator.ts` + `apps/api/src/kernel/config/env.ts` (+ policy `public-page`: `RATE_LIMIT_PUBLIC_PAGE_LIMIT` 120 / `RATE_LIMIT_PUBLIC_PAGE_WINDOW_SECONDS` 3600), `docs/CONTRACTS.md`
- Create: `apps/api/drizzle/00NN_public_profiles.sql` (custom, after the generated one: RLS + policies for both tables, the definer function, `GRANT SELECT ON school_public_profiles, schools TO driveos_definer`), `apps/api/src/modules/school/domain/slug.ts`, `apps/api/src/modules/school/domain/reviews.ts`, `apps/api/src/modules/school/commands/update-public-profile.{command,handler}.ts`, `.../submit-review.{command,handler}.ts`, `.../moderate-review.{command,handler}.ts`, `.../delete-student-review.{command,handler}.ts`, `apps/api/src/modules/school/queries/get-public-profile.{query,handler}.ts`, `.../get-public-school-page.{query,handler}.ts`, `.../list-reviews.{query,handler}.ts`, `.../resolve-public-slug.{query,handler}.ts`, `apps/api/src/modules/school/subscribers/student-anonymized.subscriber.ts`, `apps/api/src/modules/school/http/public-profile.controller.ts`, `.../public-school.controller.ts`, `.../reviews.controller.ts`, `apps/api/src/modules/school/infra/public-profile-records.ts`, `.../review-records.ts`
- Test: `apps/api/test/school/domain/slug.test.ts`, `.../domain/reviews.test.ts`, `apps/api/test/school/public-page-http.test.ts`, `apps/api/test/school/reviews-http.test.ts`

**Interfaces:**
- Consumes: `SchoolHasFeatureQuery` (Task 1), `ListPublicPriceItemsQuery` (Task 3, stub it in this task as a query that returns `[]` until Task 3 lands — **no**: order Task 3 before the public page composition; see §Delivery order below), `MembershipDirectory.listByRole('instructor')`, training `HasPassedPracticalQuery` (Task 4) — until Task 4 lands, `SubmitReviewHandler` calls the query and Task 4 provides it; run Task 4 before `reviews-http.test.ts` is enabled.
- Produces:
  - DTOs: `publicProfileSchema`, `updatePublicProfileRequestSchema`, `publicSchoolPageSchema`, `reviewSchema`, `submitReviewRequestSchema`, `listReviewsQuerySchema`, `reviewListResponseSchema`, `moderateReviewRequestSchema`.
  - Queries: `ResolvePublicSlugQuery(slug) → string | null` (runs the definer function; must be executed in a school-less scope), `GetPublicSchoolPageQuery() → PublicSchoolPage` (school scope), `GetPublicProfileQuery`, `ListReviewsQuery(params)`.
  - Commands: `UpdatePublicProfileCommand(actor, body)`, `SubmitReviewCommand(actor, studentId, body)`, `ModerateReviewCommand(actor, reviewId, body)`, `DeleteStudentReviewCommand(studentId)`.
  - Events: `ReviewSubmitted` v1 `{ reviewId, studentId, rating, submittedAt }`, `ReviewModerated` v1 `{ reviewId, status, moderatedAt }`.
  - Definer function: `school_id_for_public_slug(slug text) returns uuid`.

- [ ] **Step 1: Domain tests**

`apps/api/test/school/domain/slug.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { RESERVED_SLUGS, slugIssues } from '../../../src/modules/school/domain/slug.js';

describe('slugIssues', () => {
  it.each(['fahrschule-spree', 'abc', 'a1-b2'])('accepts %s', (slug) => {
    expect(slugIssues(slug)).toEqual([]);
  });
  it.each(['ab', '-abc', 'abc-', 'Abc', 'a_b', 'a'.repeat(41)])('rejects %s', (slug) => {
    expect(slugIssues(slug)).not.toEqual([]);
  });
  it.each([...RESERVED_SLUGS])('rejects reserved %s', (slug) => {
    expect(slugIssues(slug)).toEqual([{ path: ['slug'], message: 'Reserved' }]);
  });
});
```

`apps/api/test/school/domain/reviews.test.ts`:
```ts
describe('displayNameOf', () => {
  it('uses first name and initial of the last name', () => {
    expect(displayNameOf('Stella Student')).toBe('Stella S.');
    expect(displayNameOf('Madonna')).toBe('Madonna');
    expect(displayNameOf('  Ana  Maria  Lopes ')).toBe('Ana L.');
  });
});
describe('reviewSummary', () => {
  it('averages approved ratings in basis points of a star', () => {
    expect(reviewSummary([5, 4])).toEqual({ count: 2, averageRatingTenths: 45 });
    expect(reviewSummary([])).toEqual({ count: 0, averageRatingTenths: 0 });
  });
});
```

- [ ] **Step 2: Run → FAIL.** Implement `domain/slug.ts`:
```ts
export const RESERVED_SLUGS: ReadonlySet<string> = new Set(['admin', 'api', 'login', 's', 'docs', 'platform', 'www', 'app']);
const SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
export function slugIssues(slug: string): { path: string[]; message: string }[] {
  if (slug.length < 3 || slug.length > 40 || !SLUG.test(slug)) return [{ path: ['slug'], message: 'Use 3–40 lower-case letters, digits and hyphens' }];
  if (RESERVED_SLUGS.has(slug)) return [{ path: ['slug'], message: 'Reserved' }];
  return [];
}
```
and `domain/reviews.ts` (`displayNameOf`, `reviewSummary` returning `averageRatingTenths` = round(avg × 10)).

- [ ] **Step 3: Schema + migration**

`schema.ts` additions:
```ts
export const schoolPublicProfiles = pgTable('school_public_profiles', {
  schoolId: schoolId().primaryKey(),
  slug: text('slug').notNull().unique('school_public_profiles_slug_key'),
  published: boolean('published').notNull().default(false),
  headline: text('headline'),
  description: text('description'),
  phone: text('phone'),
  whatsappNumber: text('whatsapp_number'),
  instagramUrl: text('instagram_url'),
  facebookUrl: text('facebook_url'),
  externalReviewUrl: text('external_review_url'),
  showPrices: boolean('show_prices').notNull().default(true),
  showInstructors: boolean('show_instructors').notNull().default(true),
  version: integer('version').notNull().default(1),
  ...timestamps(),
});
export const schoolReviewsStatus = pgEnum('school_reviews_status', ['pending', 'approved', 'hidden']);
export const schoolReviews = pgTable('school_reviews', {
  id: id(),
  schoolId: schoolId(),
  studentId: uuid('student_id').notNull().unique('school_reviews_student_key'),
  rating: smallint('rating').notNull(),
  text: text('text'),
  displayName: text('display_name').notNull(),
  status: schoolReviewsStatus('status').notNull().default('pending'),
  submittedAt: tstz('submitted_at').notNull(),
  moderatedAt: tstz('moderated_at'),
  moderatedByUserId: uuid('moderated_by_user_id'),
  version: integer('version').notNull().default(1),
  ...timestamps(),
}, (t) => [check('school_reviews_rating_check', sql`${t.rating} between 1 and 5`)]);
```
(`students` FK: the FK to another module's table is allowed in the DB; reference it in the custom SQL with `ALTER TABLE school_reviews ADD CONSTRAINT school_reviews_student_id_fk FOREIGN KEY (student_id) REFERENCES students(id)` so the schema file does not import training's schema.)

Generate: `drizzle-kit generate` (name `public_profiles`), then `drizzle-kit generate --custom --name public_profiles_rls` with:
```sql
ALTER TABLE "school_reviews" ADD CONSTRAINT "school_reviews_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "students"("id");
--> statement-breakpoint
ALTER TABLE "school_public_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "school_public_profiles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "school_public_profiles_tenant" ON "school_public_profiles" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "school_reviews" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "school_reviews" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "school_reviews_tenant" ON "school_reviews" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT ON "school_public_profiles" TO driveos_definer;
--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO driveos_definer;
--> statement-breakpoint
-- A public page request has no school; the slug is global. Returns the school only when published and active.
CREATE FUNCTION school_id_for_public_slug(slug text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT p.school_id
    FROM school_public_profiles p
    JOIN schools s ON s.id = p.school_id
   WHERE p.slug = school_id_for_public_slug.slug
     AND p.published
     AND s.status = 'active'
$$;
--> statement-breakpoint
ALTER FUNCTION school_id_for_public_slug(text) OWNER TO driveos_definer;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM driveos_definer;
--> statement-breakpoint
REVOKE ALL ON FUNCTION school_id_for_public_slug(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION school_id_for_public_slug(text) TO app_rw;
```
Copy the exact `TENANT_PREDICATE` text from `rls.test.ts` so the policy check passes. Add both tables to `SPEC_TABLES.school` in `test/db/spec-tables.ts`. Add to `security-definer.test.ts` `FUNCTIONS`: `{ name: 'school_id_for_public_slug', args: 'slug text', result: 'uuid' }` plus a describe proving: published+active → id; unpublished → null; suspended school → null; unknown → null.

- [ ] **Step 4: DTOs** in `packages/shared/src/dto/school.ts`:
```ts
const publicProfileFields = {
  slug: z.string().trim().min(3).max(40),
  published: z.boolean(),
  headline: z.string().trim().max(120).nullable(),
  description: z.string().trim().max(2000).nullable(),
  phone: phoneSchema.nullable(),          // add phoneSchema = z.string().regex(/^\+[1-9]\d{6,14}$/) to common.ts
  whatsappNumber: phoneSchema.nullable(),
  instagramUrl: z.url({ protocol: /^https$/ }).max(300).nullable(),
  facebookUrl: z.url({ protocol: /^https$/ }).max(300).nullable(),
  externalReviewUrl: z.url({ protocol: /^https$/ }).max(500).nullable(),
  showPrices: z.boolean(),
  showInstructors: z.boolean(),
};
export const publicProfileSchema = z.object({ ...publicProfileFields, version: z.number().int().positive() });
export const updatePublicProfileRequestSchema = z.strictObject(publicProfileFields).partial().refine(hasSomeField, { message: NO_FIELDS_MESSAGE });
export const publicSchoolPageSchema = z.object({
  slug: z.string(), name: z.string(), headline: z.string().nullable(), description: z.string().nullable(),
  address: z.string(), phone: z.string().nullable(), whatsappUrl: z.url().nullable(),
  instagramUrl: z.url().nullable(), facebookUrl: z.url().nullable(), externalReviewUrl: z.url().nullable(),
  timeZone: timeZoneSchema, currency: currencySchema, locale: localeSchema,
  branches: z.array(z.object({ id: z.uuid(), name: z.string(), address: z.string(), lat: latitudeSchema, lng: longitudeSchema,
    openingHours: z.array(z.object({ weekday: weekdaySchema, opens: localTimeSchema, closes: localTimeSchema })) })),
  prices: z.array(z.object({ id: z.uuid(), name: z.string(), kind: priceItemKindSchema, amountMinor: amountMinorSchema, currency: currencySchema, creditMinutes: minutesSchema.nullable() })),
  instructors: z.array(z.object({ membershipId: z.uuid(), name: z.string() })),
  reviews: z.object({ count: count, averageRatingTenths: z.number().int().min(0).max(50),
    items: z.array(z.object({ id: z.uuid(), displayName: z.string(), rating: z.number().int().min(1).max(5), text: z.string().nullable(), submittedAt: dateTimeSchema })) }),
  licenceClasses: z.array(licenceClassSchema),      // distinct licence classes of active lesson types; from school's price items' names is not reliable, so take them from the public price items' `licenceClass` if present else ['B']
  consentTextVersion: z.string(),                   // 'lead-consent.v1'
});
export const publicSlugParamsSchema = z.object({ slug: z.string().trim().min(3).max(40) });
export const reviewSchema = z.object({ id: z.uuid(), studentId: z.uuid(), displayName: z.string(), rating: z.number().int().min(1).max(5), text: z.string().nullable(), status: reviewStatusSchema, submittedAt: dateTimeSchema, moderatedAt: dateTimeSchema.nullable() });
export const submitReviewRequestSchema = z.strictObject({ rating: z.number().int().min(1).max(5), text: z.string().trim().max(600).optional() });
export const listReviewsQuerySchema = pageQuerySchema.extend({ status: reviewStatusSchema.optional() });
export const reviewListResponseSchema = pageResponseSchema(reviewSchema);
export const moderateReviewRequestSchema = z.strictObject({ status: reviewStatusSchema.extract(['approved', 'hidden']) });
```
Keep `licenceClasses` simple: derive from active price items of kind `package`/`lesson` is not possible; instead add `licenceClasses: z.array(licenceClassSchema)` filled from the school's active lesson types through scheduling's public `ListLessonTypesQuery` (check `apps/api/src/modules/scheduling/index.ts` for the exact query name; if none exists, add `ListLessonTypesQuery` there). Add samples for every new schema in `samples/school.ts`.

- [ ] **Step 5: HTTP tests** (`public-page-http.test.ts`), written before the handlers:
```ts
it('PUT /v1/school/public-profile saves and GET returns it', async () => {
  const put = await http.put('/v1/school/public-profile').set(authHeaders(A)).send({ slug: 'school-a', headline: 'Learn with us', whatsappNumber: '+355691234567', published: true });
  expect(put.status).toBe(StatusCodes.OK);
  const get = await http.get('/v1/school/public-profile').set(authHeaders(A));
  expect(get.body).toMatchObject({ slug: 'school-a', published: true, showPrices: true });
});
it('rejects a slug another school uses with 409 slug_taken', ...);   // B saves 'school-a' → 409
it('rejects publishing without the enrolment_page feature with 403 feature_not_in_plan', ...); // B's plan has no feature
it('GET /v1/public/schools/:slug returns the page without auth and caches for 60 s', async () => {
  const res = await http.get('/v1/public/schools/school-a');
  expect(res.status).toBe(StatusCodes.OK);
  expect(res.headers['cache-control']).toBe('public, max-age=60');
  expect(res.body).toMatchObject({ slug: 'school-a', name: expect.any(String), whatsappUrl: 'https://wa.me/355691234567', reviews: { count: 0, items: [] } });
});
it('returns 404 school_not_found for an unknown or unpublished slug', ...);
it('returns 404 when the school lost the plan feature', ...);
it('shows only approved reviews, newest first, and the average', ...); // insert pending/approved/hidden rows via tenants.asSchool
```
`reviews-http.test.ts`: student without a passed practical attempt → 403 `review_not_available`; with one → 201, second → 409 `review_exists`; office lists pending and approves; `StudentAnonymized` delivered to the worker deletes the review (use `createWorkerTestHarness`, append the event, `drainWorker`).

- [ ] **Step 6: Implement** records, commands, queries, controllers.

`UpdatePublicProfileHandler`: validate `slugIssues` (→ `invalidField`), when `published: true` (or already published and body keeps it) require `SchoolHasFeatureQuery('enrolment_page')` else `throw new ApiError(StatusCodes.FORBIDDEN, 'feature_not_in_plan', t('errors.feature_not_in_plan'))`; upsert row (`onConflictDoUpdate` on `school_id`, `version = version + 1`); map `PG_UNIQUE_VIOLATION` on `school_public_profiles_slug_key` to `new ConflictError('slug_taken', t('errors.slug_taken'))`. Return `{ id: schoolId, version }`.

`PublicSchoolController` (`@Controller('public/schools')`, `@Public()`, `@RateLimit({ name: 'public-page', keyBy: 'ip+route' })`):
```ts
@Get(':slug')
@ApiRoute({ operationId: 'publicSchools.get', summary: "A school's public enrolment page", status: StatusCodes.OK, params: 'PublicSlugParams', response: 'PublicSchoolPage', public: true })
@Header('Cache-Control', 'public, max-age=60')
async get(@Param(new ZodValidationPipe(publicSlugParamsSchema)) { slug }: PublicSlugParams): Promise<PublicSchoolPage> {
  return this.publicPages.render(slug);   // infra/public-pages.ts
}
```
`infra/public-pages.ts` `render(slug)`: `schoolId = await tenant.runInTenant({ schoolId: null, userId: null }, () => queryBus.execute(new ResolvePublicSlugQuery(slug)))`; if null → `notFound(t('errors.school_not_found'))` with code `school_not_found` (add a `SchoolNotFoundError extends ApiError(StatusCodes.NOT_FOUND, 'school_not_found', ...)`); then `tenant.runInTenant({ schoolId, userId: null }, async () => { if (!(await queryBus.execute(new SchoolHasFeatureQuery('enrolment_page')))) throw schoolNotFound(); return queryBus.execute(new GetPublicSchoolPageQuery()); })`. Note: the tenant interceptor opens a scope for non-public routes only; confirm in `tenant.interceptor.ts` that `@Public()` routes get no scope (the webhook controller relies on the same).

`GetPublicSchoolPageHandler` composes: profile row (404 if unpublished — defensive), `GetSchoolQuery`, `ListBranchesQuery` + `GetOpeningHoursQuery`, `ListPublicPriceItemsQuery` (Task 3) when `showPrices`, `MembershipDirectory.listByRole('instructor')` filtered `status === 'active'` with names via `ListStaffQuery` or `directory.contactsOf(userIds)` when `showInstructors`, approved reviews (newest 20) + `reviewSummary`. `whatsappUrl = whatsappNumber ? 'https://wa.me/' + digits : null`.

`SubmitReviewHandler(actor, body)`: `studentId` from `GetStudentByUserQuery(actor.userId)` (404 if none); `HasPassedPracticalQuery(studentId)` false → `ApiError(FORBIDDEN, 'review_not_available')`; insert with `displayName = displayNameOf(student.fullName)` (fullName via `ListStudentNamesQuery([studentId])`); unique violation → `ConflictError('review_exists')`; append `ReviewSubmitted` on aggregate `school_review`/reviewId v1. `ModerateReviewHandler`: load under RLS (404), set status/moderatedAt/moderatedByUserId, version+1, append `ReviewModerated`. `StudentAnonymizedSubscriber` (`school.review-anonymizer`, worker module) executes `DeleteStudentReviewCommand(payload.studentId)`.

Routes (add to `spec-routes.ts` under a `school` group and to fixtures):
- `GET /v1/school/public-profile` `public_page.manage`; `PUT /v1/school/public-profile` `public_page.manage` (fixture: B saves its own slug and A's stays).
- `GET /v1/public/schools/:slug` public → `route-allowlist.ts`: `{ reason: 'public', note: 'public enrolment page: school resolved via SECURITY DEFINER school_id_for_public_slug; only published data' }`.
- `POST /v1/reviews` `reviews.submit`; `GET /v1/reviews` `reviews.moderate`; `PATCH /v1/reviews/:id` `reviews.moderate` (fixture: A's review id → B gets 404).

Permissions: add to `PERMISSIONS`, `OFFICE` gets `reviews.moderate`, `STUDENT` gets `reviews.submit`; owner inherits all. Mirror in `apps/admin/src/lib/permissions.ts` and the mobile `permissions.ts` if it lists them. i18n: `errors.slug_taken`, `errors.feature_not_in_plan`, `errors.school_not_found`, `errors.review_exists`, `errors.review_not_available`.

Exports in `index.ts`: all new commands/queries; document each in `docs/CONTRACTS.md` (school section) including the subscriber and the definer function.

- [ ] **Step 7: Gate** and handoff note.

---

### Task 3: Public price items (billing)

**Files:**
- Modify: `apps/api/src/modules/billing/infra/schema.ts` (`priceItems.showOnPublicPage boolean not null default false`), `packages/shared/src/dto/billing.ts` (`showOnPublicPage` in `priceItemFields`, create/update requests, `priceItemSchema`), samples, `apps/api/src/modules/billing/commands/create-price-item.handler.ts`, `.../update-price-item.handler.ts`, `apps/api/src/modules/billing/index.ts`, `apps/api/src/modules/billing/billing.module.ts`, `packages/shared/src/mocks/fixtures/catalogue.ts`, `docs/CONTRACTS.md`
- Create: `apps/api/src/modules/billing/queries/list-public-price-items.{query,handler}.ts`
- Test: `apps/api/test/billing/public-price-items.test.ts`

**Interfaces:**
- Produces: `ListPublicPriceItemsQuery() → PublicPriceItem[]` where `PublicPriceItem = { id, name, kind, amountMinor, currency, creditMinutes }`, only `active && showOnPublicPage`, ordered by `sortOrder, name`.

- [ ] Write the test (create three items via `POST /v1/price-items`: one public active, one public inactive, one private; `executeAs(kernel.app, A, new ListPublicPriceItemsQuery())` returns only the first; `PATCH` can flip the flag). Run → FAIL. Implement (`drizzle-kit generate`, name `price_items_public`). Gate. Handoff.

---

### Task 4: Training public queries for reviews and conversion (training)

**Files:**
- Create: `apps/api/src/modules/training/queries/has-passed-practical.{query,handler}.ts`
- Modify: `apps/api/src/modules/training/index.ts`, `training.module.ts`, `docs/CONTRACTS.md`
- Test: `apps/api/test/training/public-queries.test.ts` (extend)

**Interfaces:**
- Produces: `HasPassedPracticalQuery(studentId) → boolean` (true when a `test_attempts` row has `kind = 'practical'` and `result = 'passed'`; check the enum value in `packages/shared/src/dto/enums.ts` `testAttemptResultSchema` and use exactly that string).

- [ ] Test: student with a passed practical → true; theory pass only → false; unknown id → false. Run → FAIL. Implement. Gate. Handoff. (Small task; can be folded into Task 2's PR if the same executor runs both, but keep the test.)

---

### Task 5: Leads (training)

**Files:**
- Modify: `apps/api/src/modules/training/infra/schema.ts` (+ `leads`, enums `leads_status`, `leads_source`), `packages/shared/src/dto/training.ts`, `packages/shared/src/dto/samples/training.ts`, `packages/shared/src/dto/enums.ts` (`leadStatusSchema`, `leadSourceSchema`), `packages/shared/src/events/training.ts` (+ `LeadCaptured`, `LeadConverted`, `LeadStatusChanged`), catalogue/samples/test list, `apps/api/src/modules/identity/domain/permissions.ts` (+ `leads.read`, `leads.manage` → OFFICE), `apps/admin/src/lib/permissions.ts`, `apps/api/src/modules/training/index.ts`, `training.module.ts`, `training-worker.module.ts`, `apps/api/test/support/spec-routes.ts`, `route-allowlist.ts`, `apps/api/test/training/route-fixtures.ts`, `apps/api/test/db/spec-tables.ts`, `apps/api/src/kernel/http/rate-limit.decorator.ts` + `env.ts` (+ `leads`: 10 / 3600, `leads-contact`: 3 / 86400), `apps/api/test/cross-tenant/foreign-ids.test.ts` (convert body carries `primaryInstructorMembershipId` → 400 `validation_error`, same as `POST /v1/students`), `docs/CONTRACTS.md`
- Create: custom migration `leads_rls` (RLS + policy + CHECKs: `phone is not null or email is not null`; `not is_minor or (guardian_name is not null and guardian_contact is not null)`; indexes `(school_id, status, created_at desc)`, `(school_id, lower(email))`, `(school_id, phone)`), `apps/api/src/modules/training/domain/leads.ts`, `commands/capture-lead.{command,handler}.ts`, `commands/update-lead.{command,handler}.ts`, `commands/convert-lead.{command,handler}.ts`, `commands/purge-leads.{command,handler}.ts`, `queries/list-leads.{query,handler}.ts`, `queries/get-lead.{query,handler}.ts`, `http/leads.controller.ts`, `http/public-leads.controller.ts`, `infra/lead-records.ts`, `infra/lead-purge.job.ts`
- Test: `apps/api/test/training/domain/leads.test.ts`, `apps/api/test/training/leads-http.test.ts`, `apps/api/test/training/lead-purge.test.ts`

**Interfaces:**
- Consumes: `ResolvePublicSlugQuery`, `SchoolHasFeatureQuery`, `CreateStudentCommand`, `CreateInvitationCommand`, `LinkGuardianCommand`.
- Produces:
  - DTOs: `captureLeadRequestSchema` `{ fullName, phone?, email?, licenceClass, message?, isMinor, guardianName?, guardianContact?, consentTextVersion, website? }` with refinements (phone or email; minor → guardian fields), `createLeadRequestSchema` (staff, same minus `website`/consent with `source: 'manual'` implied; consent fields optional), `leadSchema`, `listLeadsQuerySchema` (`pageQuery + status? + q?`), `leadListResponseSchema`, `updateLeadRequestSchema` `{ status?: 'contacted'|'lost', note?, lostReason? }`, `convertLeadRequestSchema` = `createStudentRequestSchema` fields (all optional, pre-filled client-side) + `{ invite: boolean, inviteParent: boolean }`, `convertLeadResponseSchema` `{ id, version, studentId, invitationId: uuid|null, parentInvitationId: uuid|null }`.
  - Commands: `CaptureLeadCommand(input: { source: 'page'|'manual', body, requestIpHash: string|null, actorUserId: string|null })`, `UpdateLeadCommand(actor, leadId, body)`, `ConvertLeadCommand(actor, leadId, body)`, `PurgeLeadsCommand(now)`.
  - Queries: `ListLeadsQuery(params)`, `GetLeadQuery(id)`.
  - Events: `LeadCaptured` v1 `{ leadId, source, licenceClass, isMinor, capturedAt }`, `LeadStatusChanged` v1 `{ leadId, status, changedAt }`, `LeadConverted` v1 `{ leadId, studentId, convertedAt }` (aggregate `lead`, versions 1, 2, …).
  - Domain: `findDuplicate(existing: LeadMatch[], candidate: { phone, email }, now, windowDays = 30) → LeadMatch | null` (same phone or lower-cased email, `status !== 'lost'`, created within window), `leadConsentIssues(body)`.

- [ ] **Step 1: Domain tests** (`domain/leads.test.ts`): duplicate by phone within 30 days → match; by email case-insensitively; lost lead → no match; 31 days old → no match; consent issues for minor without guardian.
- [ ] **Step 2: HTTP tests** (`leads-http.test.ts`), publish A's profile first via `PUT /v1/school/public-profile` (A's plan has the feature in the test fixture; set `plans.features` as in Task 1):
```ts
it('captures a lead from the public page and tells the office', ...)        // 201 {id}; row has consent_text_version, request_ip_hash; events contain LeadCaptured
it('silently accepts the honeypot', ...)                                      // website: 'x' → 202 {} and no row
it('dedupes by phone within 30 days and appends the message to the note', ...)
it('rejects a minor without guardian details', ...)                            // 400 validation_error path guardianName
it('returns 404 for an unpublished school or one without the feature', ...)
it('lists leads newest first with status filter and cursor', ...)
it('marks contacted and lost with a reason', ...)
it('converts a lead into a student and an invitation once', async () => {
  const key = `convert-${randomUUID()}`;
  const body = { primaryInstructorMembershipId: ingo.membershipId, dateOfBirth: '2004-05-06', examLanguage: 'en', invite: true, inviteParent: false };
  const first = await http.post(`/v1/leads/${leadId}/convert`).set(office.headers).set('Idempotency-Key', key).send(body);
  expect(first.status).toBe(StatusCodes.CREATED);
  expect(first.body).toMatchObject({ studentId: expect.any(String), invitationId: expect.any(String) });
  const replay = await http.post(`/v1/leads/${leadId}/convert`).set(office.headers).set('Idempotency-Key', key).send(body);
  expect(replay.body).toEqual(first.body);
  const again = await http.post(`/v1/leads/${leadId}/convert`).set(office.headers).set('Idempotency-Key', `other-${randomUUID()}`).send(body);
  expect(again.status).toBe(StatusCodes.CONFLICT);
  expect(again.body.error.code).toBe('lead_already_converted');
  await expectEvents(db, { type: LeadConverted });
});
it('converting a minor lead links the guardian and invites them when asked', ...) // inviteParent: true → parentInvitationId set, guardian_links row
```
- [ ] **Step 3: Purge test**: lost lead 13 months old deleted; converted 13 months old deleted; new lead 13 months old kept; `request_ip_hash` nulled after 30 days.
- [ ] **Step 4: Run → FAIL. Implement.**

`CaptureLeadHandler`: `fullName` trimmed, `email` lower-cased; `findDuplicate` over `leads` rows with same phone or email in the last 30 days; on duplicate: `note = note + '\n---\n' + message` (when message given), `version + 1`, return its id (no event); else insert, append `LeadCaptured`. `requestIpHash = sha256(ip)` hex computed in the public controller from `req.ip`.

`PublicLeadsController` (`@Controller('public/schools')`, `@Public()`, `@RateLimit({ name: 'leads', keyBy: 'ip+route' })`, `@RateLimit({ name: 'leads-contact', keyBy: 'contact' })` — check `rate-limit.guard.ts` how `keyBy: 'contact'` reads the body (`contact` field); if it requires a `contact` body field, set `keyBy: 'ip'` instead and note it): `POST :slug/leads` `@HttpCode(CREATED)`; honeypot → return `{}` with `StatusCodes.ACCEPTED` via `@Res({ passthrough: true })` status set, or simpler: always `201 { id }` and for honeypot return `{ id: newId() }` without writing — pick the second (no status juggling; the spec's 202 is replaced by 201 with a throw-away id; update the spec sentence). Resolve the school like Task 2's public page (school-less scope → definer query → feature check → `runInTenant`).

`ConvertLeadHandler`: lock the lead row (`for update`), 404 / 409 `lead_already_converted`; build `CreateStudentRequest` from lead + body (`fullName`, `licenceClass` from lead; `dateOfBirth`, `examLanguage`, `primaryInstructorMembershipId`, `enrolment` from body); `commandBus.execute(new CreateStudentCommand(actor, request))`; if `invite`: `CreateInvitationCommand(actor.userId, ['student'], { phone, email }, studentId, [])`; if `isMinor && inviteParent`: `LinkGuardianCommand(actor, studentId, { phone/email: guardianContact })` (it creates a parent invitation; see `link-guardian.handler.ts`); update lead; append `LeadConverted`. Route `POST /v1/leads/:id/convert` is `@Idempotent()` (import from `apps/api/src/kernel/idempotency`; copy usage from `POST /v1/lessons`).

`LeadPurgeJob` (`training.lead-purge`, pattern `15 3 * * *`, `PerSchoolJobs.runForEachSchool` → `PurgeLeadsCommand(now)`), registered in `training-worker.module.ts`.

Routes + fixtures: `GET /v1/leads` (list), `POST /v1/leads` (manual), `GET /v1/leads/:id`, `PATCH /v1/leads/:id`, `POST /v1/leads/:id/convert`; allowlist `POST /v1/public/schools/:slug/leads` with note. i18n error `errors.lead_already_converted`. CONTRACTS: training section + foreign-ids table row.

- [ ] **Step 5: Gate** and handoff.

---

### Task 6: Reporting attribution (reporting)

**Files:**
- Modify: `apps/api/src/modules/reporting/infra/schema.ts` (`rm_school_metrics_daily` + `leadsCaptured`, `leadsConverted`, `leadRevenueMinor`; `growth_reports` + same three; new `rmLeadStudents`), `apps/api/src/modules/reporting/domain/metrics.ts` (`METRIC_KEYS` + three keys; `leadContribution(event)`), `apps/api/src/modules/reporting/domain/growth.ts` (`GrowthDayRow`/`GrowthMetrics` + `leadsCaptured`, `leadsConverted`, `leadRevenueMinor`), `apps/api/src/modules/reporting/infra/metrics-store.ts` (COLUMNS + `addLeadStudent(schoolId, studentId, leadId, day)`, `isLeadStudent(studentId)`), `apps/api/src/modules/reporting/infra/growth-reports.ts`, `apps/api/src/modules/reporting/infra/report-rows.ts`, `apps/api/src/modules/reporting/projections/school-metrics.projection.ts` (+ `LeadCaptured`, `LeadConverted`; on `PaymentSucceeded`/`CashPaymentRecorded` add `leadRevenueMinor` when `isLeadStudent`), `packages/shared/src/dto/reporting.ts` (`growthReportSchema` + three fields), samples, `apps/api/test/db/spec-tables.ts` (`rm_lead_students`), `apps/api/test/reporting/support.ts` (`seedGrowthReport` columns), `docs/CONTRACTS.md`, `apps/api/src/modules/messaging/domain/templates.ts` only if the growth email lists metrics (check `growth_report_generated` rendering; if it only links, nothing to do)
- Test: `apps/api/test/reporting/lead-attribution.test.ts` (projection), extend `apps/api/test/reporting/domain/*.test.ts` for `growthMetrics` sums

- [ ] Tests first: deliver `LeadCaptured` (day D) → `leads_captured = 1`; `LeadConverted` → `leads_converted = 1` and `rm_lead_students` row; then `CashPaymentRecorded` for that student 5,000 → `lead_revenue_minor = 5000`; a payment for a non-lead student → unchanged; stale event (lower aggregate version) ignored. `growthMetrics` sums the three. Run → FAIL. Implement (migration `lead_metrics`, RLS policy for `rm_lead_students` in a custom migration). Gate. Handoff.

---

### Task 7: Notifications (messaging)

**Files:**
- Modify: `apps/api/src/modules/messaging/domain/templates.ts` (+ `lead_captured: z.object({ leadId: z.uuid(), fullName: z.string(), licenceClass: z.string() })` policy PUSH_OR_EMAIL; `review_request: z.object({ studentId: z.uuid(), url: z.url(), externalReviewUrl: z.url().nullable() })` policy PUSH_OR_EMAIL), `apps/api/src/kernel/i18n/locales/en.json` (`notifications.lead_captured.{push_title,push_body,email_subject,email_text}`, `notifications.review_request.{...}`), `apps/api/src/modules/messaging/messaging-worker.module.ts`, `docs/CONTRACTS.md` (event consumers table)
- Create: `apps/api/src/modules/messaging/subscribers/lead-notifications.subscriber.ts` (`messaging.lead-notifications`, events `[LeadCaptured]`; recipients: `MembershipDirectory.listByRole('owner')` ∪ `listByRole('office')` active → `userIds`; needs the lead's name: add `fullName` and `licenceClass` to the `LeadCaptured` payload in Task 5 — **do this in Task 5** so the event carries `{ leadId, source, licenceClass, isMinor, fullName, capturedAt }`), `apps/api/src/modules/messaging/subscribers/review-request.subscriber.ts` (`messaging.review-request`, events `[TestAttemptRecorded]`; when `kind === 'practical' && result === <passed value>`: `GetStudentRecipientsQuery(studentId)` → if `studentUserId` null skip; `GetPublicProfileQuery` for `externalReviewUrl` (null when no profile); `SendNotificationCommand({ recipients: { userIds: [studentUserId] }, template: 'review_request', payload: { studentId, url: `${APP_DEEP_LINK}student/review`, externalReviewUrl }, timing: 'deferred', dedupeKey: `review_request:${studentId}` })`)
- Test: `apps/api/test/messaging/lead-notifications.test.ts`, `apps/api/test/messaging/review-request.test.ts` (uses `createWorkerTestHarness`; asserts one notification row per recipient, dedupe on second delivery and on a second pass, skip for a student without a login, skip for theory or failed attempts)

Deep link base: add `MOBILE_DEEP_LINK_SCHEME` env default `driveos://` in `env.ts`; `url = `${scheme}student/review``.

- [ ] Tests → FAIL → implement → gate → handoff.

---

### Task 8: Admin — leads inbox, public page settings, reports funnel

**Files:**
- Modify: `apps/admin/src/lib/navigation.ts` (+ `/leads` with icon `Inbox`-like, `anyOf: ['leads.read']`, label `nav.leads`; hide when `me.active.features` lacks `enrolment_page` — add `features` to `SessionContextValue` in `hooks/use-session.ts` and a `useHasFeature(feature)` hook), `apps/admin/src/components/app-shell.tsx` (pass features into `visibleNavItems(permissions, features)`), `apps/admin/src/routes/_app/settings.tsx` (+ tab `publicPage`), `apps/admin/src/components/reports/growth-history.tsx` and `range-reports.tsx` (+ leads columns/funnel card), `apps/admin/src/locales/en.json` (`nav.leads`, `leads.*`, `publicPage.*`, `reviews.*`, `reports.growth.leads*`), `packages/shared/src/mocks/store.ts` + `collections.ts` + `fixtures/*.ts` (leads, public profile, reviews collections and samples so mock mode works), `apps/admin/e2e/fixtures.ts`, `apps/admin/e2e/pages/leads.page.ts`
- Create: `apps/admin/src/routes/_app/leads/index.tsx`, `apps/admin/src/components/leads/leads-table.tsx`, `.../lead-drawer.tsx`, `.../convert-lead-form.tsx` (reuse `CreateStudentForm` fields: open `components/students/create-student-form.tsx` and extract the field group into `student-fields.tsx` if it is not already reusable), `apps/admin/src/components/settings/public-page-form.tsx`, `.../public-price-toggles.tsx`, `.../reviews-moderation.tsx`, `apps/admin/e2e/tests/leads.spec.ts`
- Test: `apps/admin/test/components/leads.test.tsx` (vitest + testing-library, mock mode), Playwright `leads.spec.ts` (mock project): office opens Leads, sees the fixture lead, converts it, lands on the student profile; owner publishes the page in settings.

- [ ] Write the component test and the Playwright spec first (they fail), implement, run `pnpm --filter @driveos/admin test` and `pnpm --filter @driveos/admin test:e2e`, gate, handoff.

---

### Task 9: Admin — public page route `/s/$slug`

**Files:**
- Create: `apps/admin/src/routes/s/$slug.tsx` (outside `_app`; no auth; `loader` fetches `GET /v1/public/schools/{slug}` with the plain fetch client, no bearer), `apps/admin/src/components/public-page/public-page.tsx`, `.../enrolment-form.tsx` (TanStack Form + zod `captureLeadRequestSchema`; minor toggle reveals guardian fields; consent checkbox text `publicPage.consent.v1` with `consentTextVersion: 'lead-consent.v1'`; hidden `website` input with `tabIndex={-1}` and `autoComplete="off"`; success state), `.../price-list.tsx`, `.../reviews.tsx`, `apps/admin/e2e/pages/public-page.page.ts`, `apps/admin/e2e/tests/public-page.spec.ts`
- Modify: `apps/admin/src/routes/__root.tsx` only if the root assumes a session (check `beforeLoad`); `apps/admin/src/locales/en.json` (`publicPage.*`), `packages/shared/src/mocks/*` (public routes resolvers: `publicSchools.get`, `publicLeads.create`)
- Test: `apps/admin/test/components/public-page.test.tsx` (renders sample page; minor toggle requires guardian; submit posts the body with `consentTextVersion`), Playwright `public-page.spec.ts` (mock): visit `/s/fahrschule-spree`, see prices and reviews, submit the form, see "Thanks".

- [ ] Tests first → implement → admin test + e2e → gate → handoff.

---

### Task 10: Mobile — review screen

**Files:**
- Create: `apps/mobile/app/(student)/student/review.tsx` (re-export), `apps/mobile/src/screens/student/review.tsx` (stars 1–5 as `Pressable`s with `accessibilityRole="radio"`, text input ≤ 600, submit → `POST /v1/reviews`; on 403 `review_not_available` show `review.notYet` and a back button; on 409 show `review.alreadySent`), `apps/mobile/test/student/review-flow.test.ts` (pure flow helper `reviewSubmission(state)` in `apps/mobile/src/lib/review-flow.ts`: validates rating 1–5 and text length, maps API errors to screen states)
- Modify: `apps/mobile/app/(student)/student/(home)/_layout.tsx` is not involved (review lives outside the home stack); `apps/mobile/src/lib/push-target.ts` (+ template `review_request` → `/student/review`), `apps/mobile/src/locales/en.json` (`review.*`), `apps/mobile/src/screens/student/home.tsx` (card "Rate your school" shown when `GET /v1/me` … — the spec's `canReview` flag is not in `/v1/me`; instead show the card when the student has a passed practical attempt in `GET /v1/students/{id}/progress`, or simply always offer the screen from Account and rely on the API's 403; choose the latter: a row in `account-screen.tsx` under the student role).

- [ ] Flow test first → implement → `pnpm --filter @driveos/mobile test` → gate → handoff.

---

### Task 11: Seed, docs and final gate

**Files:**
- Modify: `apps/api/scripts/db/seed-data.ts` + `seed.ts` (Fahrschule Spree: profile `fahrschule-spree` published, WhatsApp `+4915550000002`, two price items flagged public, one approved review by Sam Schulz with a passed practical attempt, one `new` lead "Lea Lead"), `docs/OPERATIONS.md` (§1 seed table, §5 new env vars, §10), `docs/SPEC.md` §2 (premium feature list under a new "Premium (Pro)" heading), §3.6 (events), §5 (tables), §8 (routes), §6.2 (function), `docs/CONTRACTS.md` (recipe mentions), `.env.example` files (new env vars)
- Test: existing seed test (`apps/api/test/db/seed.test.ts` if present) and `pnpm --filter @driveos/api db:reset && db:seed`

- [ ] Update, run the full gate and the real-API Playwright project (`E2E_REAL_API=1 pnpm --filter @driveos/admin exec playwright test --project real-api`) with api, worker and admin running; fix what fails; handoff.

---

## Delivery order and parallelism

Sequential dependencies: 1 → 3 → 4 → 2 → 5 → 6 → 7 → {8, 9, 10 in parallel} → 11. Task 2's public page composition imports `ListPublicPriceItemsQuery` (Task 3) and `SubmitReviewHandler` imports `HasPassedPracticalQuery` (Task 4), so run 3 and 4 before 2. Each task is one commit on `main` after its review passes; push after each commit.

## Self-review notes

- Spec §5 route table is covered by Tasks 2 (profile, public page, reviews), 5 (leads), 1 (`/v1/me` features).
- Spec §4 tables: 4.1 Task 1, 4.2–4.3 Task 2, 4.4 Task 5, 4.5 Task 3, 4.6 Task 6.
- Spec §5.2 honeypot returns 201 with a throw-away id instead of 202 (simpler controller; update the spec when Task 5 lands).
- Spec §6.2 `canReview` on `/v1/me` is dropped; the screen relies on the API's 403 (Task 10). Update the spec when Task 10 lands.
- Spec §5.2 `LeadCaptured` payload gains `fullName` so the notification can name the lead (Task 5 + 7).
