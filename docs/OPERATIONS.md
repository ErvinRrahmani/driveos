# DriveOS operations notes

How to run, configure, back up and restore DriveOS, as the code works today. Architecture and rules are in [`CLAUDE.md`](../CLAUDE.md) and [`docs/SPEC.md`](SPEC.md) (§3 architecture, §6.2 roles, §9 adapters, §10 non-functional). Anything this file calls a recommendation or TODO is not built.

## 1. Running it locally

### Ports

| Service | Host port | Source |
| --- | --- | --- |
| Postgres 16 | 15432 | `POSTGRES_PORT` in root `.env` |
| Redis 7 | 16379 | `REDIS_PORT` |
| MinIO API / console | 19000 / 19001 | `MINIO_API_PORT` / `MINIO_CONSOLE_PORT` |
| Mailpit SMTP / UI | 11025 / 18025 | `MAILPIT_SMTP_PORT` / `MAILPIT_UI_PORT` |
| API (`apps/api`) | 13000 | `API_PORT` in `apps/api/.env` |
| Admin (`apps/admin`) | 15173 | `ADMIN_PORT` in `apps/admin/.env` |

### First run

```sh
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/admin/.env.example apps/admin/.env
cp apps/mobile/.env.example apps/mobile/.env

docker compose -p driveos up -d          # postgres, redis, minio, mailpit (compose project name is also set in the file)
pnpm i
pnpm --filter @driveos/api db:reset      # drop + create + bootstrap + migrate
pnpm --filter @driveos/api db:seed       # demo schools and logins
pnpm generate                            # OpenAPI document + API client (not committed)
pnpm dev                                 # turbo: api + worker, admin (vite), mobile (expo start)
```

The root `.env` only feeds `docker-compose.yml`. The API and worker read `apps/api/.env` from their working directory ([`apps/api/src/main.ts`](../apps/api/src/main.ts), [`worker.ts`](../apps/api/src/worker.ts)); variables set in the real environment take precedence over the file. `pnpm --filter @driveos/api dev` runs `dev:api` and `dev:worker` together with `concurrently`.

For the mobile app on a physical device, `EXPO_PUBLIC_API_URL=http://localhost:13000` points at the device itself; use the machine's LAN address instead.

### Database scripts

All four live in [`apps/api/scripts/db/`](../apps/api/scripts/db/) and share [`lib.ts`](../apps/api/scripts/db/lib.ts). They load `apps/api/.env` (or `.env.example` if `.env` is missing) and validate only the four database URLs (`dbToolEnvSchema` in [`env.ts`](../apps/api/src/kernel/config/env.ts)).

| Command | What it does | Connects as |
| --- | --- | --- |
| `db:bootstrap` | Under an advisory lock: creates or alters the login roles `driveos_owner`, `app_rw` (both `NOBYPASSRLS`) and `app_system` (`BYPASSRLS`), all `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`, with the passwords taken from `DATABASE_OWNER_URL`, `DATABASE_URL`, `DATABASE_SYSTEM_URL` (it fails if a URL's user name does not match the role). Creates the no-login `driveos_definer` role (`BYPASSRLS`, `NOINHERIT`) and grants it to `driveos_owner`. Makes `driveos_owner` the database owner and grants `CONNECT` to `app_rw` and `app_system`. Idempotent. | `DATABASE_ADMIN_URL` (superuser `driveos`), maintenance DB `postgres` |
| `db:migrate` | Applies pending drizzle migrations from `apps/api/drizzle/` (drizzle-orm migrator, one connection). | `DATABASE_OWNER_URL` (`driveos_owner`) |
| `db:reset` | `DROP DATABASE ... WITH (FORCE)`, `CREATE DATABASE`, then bootstrap and migrate. Requires `DATABASE_URL` and `DATABASE_OWNER_URL` to name the same database. Destroys all data. | admin for drop/create/bootstrap, owner for migrate |
| `db:seed` | Inserts demo data (section 10). | `DATABASE_SYSTEM_URL` for global rows, `DATABASE_URL` with `app.school_id` set per school |

### Tests

```sh
pnpm generate && pnpm lint && pnpm typecheck && pnpm test
```

`pnpm test` needs the compose services. Database tests create scratch databases of their own. CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) copies the env examples, runs `docker compose up -d --wait`, `pnpm install --frozen-lockfile`, `db:reset`, `db:seed`, then `generate`, `lint`, `typecheck`, `test`; mirror that order locally when in doubt.

### Seeded logins

All seeded users sign in with a one-time code: `POST /v1/auth/code {"contact": "<phone or email>"}`, then `POST /v1/auth/verify {"contact", "code", "client": "web"}`. Codes sent by SMS are written to the API log by the console SMS adapter ([`console-sms-sender.ts`](../apps/api/src/adapters/sms/console-sms-sender.ts), log message `sms (console adapter)`, field `body`). Codes sent by email arrive in Mailpit at http://localhost:18025. `db:seed` also writes the full table with ids to `.context/seed-logins.md`.

| User | Phone | Email | School | Roles / status |
| --- | --- | --- | --- | --- |
| Petra Platform | +4915550000001 | petra.platform@example.com | none | platform admin |
| Otto Owner | +4915550000002 | otto.owner@example.com | Fahrschule Spree | owner |
| Olga Office | +4915550000003 | olga.office@example.com | Fahrschule Spree | office |
| Ingo Instructor | +4915550000004 | ingo.instructor@example.com | Fahrschule Spree | instructor |
| Ines Ferreira | +351910000005 | ines.ferreira@example.com | Escola de Condução Tejo | owner + instructor |
| Stella Student | +4915550000006 | stella.student@example.com | Fahrschule Spree | student |
| Sam Schulz | +4915550000007 | sam.schulz@example.com | Fahrschule Spree | student |
| Sofia Silva | +4915550000008 | sofia.silva@example.com | Fahrschule Spree | student |
| Simon Sommer | +4915550000009 | simon.sommer@example.com | Fahrschule Spree | student |
| Mia Minor | +4915550000010 | mia.minor@example.com | Fahrschule Spree | student, minor (16), membership `pending_consent` |
| Gustav Minor | +4915550000011 | gustav.minor@example.com | Fahrschule Spree | parent of Mia (link without consent yet) |

With `VITE_USE_MOCKS=true` (admin) or `EXPO_PUBLIC_USE_MOCKS=true` (mobile) the apps talk to the in-process mock API from `@driveos/shared/mocks`, which accepts the code `000000` (`MOCK_LOGIN_CODE`). The real API never accepts a fixed code. The `X-Dev-School` / `X-Dev-User` headers are honoured only under `NODE_ENV=test` ([`auth.module.ts`](../apps/api/src/kernel/auth/auth.module.ts)).

## 2. Database roles and RLS

| Role | Login | RLS | Used by |
| --- | --- | --- | --- |
| `driveos` | yes | superuser | Compose superuser. Used only by `db:bootstrap` / `db:reset` through `DATABASE_ADMIN_URL`. Never by the app. |
| `driveos_owner` | yes | owner | Owns the database and every table. Runs migrations (`DATABASE_OWNER_URL`). |
| `app_rw` | yes | enforced | API requests and worker subscribers and per-school jobs (`DATABASE_URL`). Not a table owner; every tenant table has RLS enabled and forced. |
| `app_system` | yes | `BYPASSRLS` | Worker only (`DATABASE_SYSTEM_URL`): outbox relay, delivery reconciler, event-delivery bookkeeping, dead letters, the dead-letter and outbox-lag alert probes, enumerating schools for scheduled jobs, idempotency purge. Per CLAUDE.md only the outbox relay, cross-school schedulers and platform billing may use it; request handlers and support access never do. |
| `driveos_definer` | no | `BYPASSRLS` | Owns the `SECURITY DEFINER` functions. |

The API process also opens an `app_system` pool (both pools are created in [`kernel/db/clients.ts`](../apps/api/src/kernel/db/clients.ts)), because the same `TenantContext` serves both processes. Code reaches it only through `TenantContext.runAsSystem`, which refuses to run inside a tenant scope.

System tables `outbox`, `event_deliveries` and `dead_letters` have no RLS. `app_rw` may only `INSERT` into `outbox`; `event_deliveries` and `dead_letters` are granted to `app_system` only. Inspect with:

```sh
docker compose -p driveos exec postgres psql -U driveos -d driveos -c '\du' -c '\dp outbox'
```

### How the tenant is set

[`kernel/tenant/tenant-context.ts`](../apps/api/src/kernel/tenant/tenant-context.ts) opens an `app_rw` transaction and runs

```sql
select set_config('app.school_id', $1, true), set_config('app.user_id', $2, true)
```

with bound parameters (empty string when there is no school or user). [`tenant.interceptor.ts`](../apps/api/src/kernel/tenant/tenant.interceptor.ts) does this for every non-public HTTP route from the access-token principal. Event subscribers run in `runInTenant({ schoolId: event.schoolId, userId: null })` ([`kernel/subscribers/event-delivery.ts`](../apps/api/src/kernel/subscribers/event-delivery.ts)); per-school scheduled jobs do the same for each non-suspended school ([`kernel/jobs/per-school.ts`](../apps/api/src/kernel/jobs/per-school.ts)). Platform onboarding and platform billing use `enterSchool`, which switches `app.school_id` inside the same transaction so RLS keeps applying. Policies read `nullif(current_setting('app.school_id', true), '')::uuid`.

### SECURITY DEFINER functions

All are owned by `driveos_definer`, `SET search_path = public, pg_temp`, `REVOKE ALL ... FROM PUBLIC`, and `GRANT EXECUTE` to `app_rw`.

| Function | Migration | Purpose |
| --- | --- | --- |
| `auth_find_user_by_contact(contact text)` | `0005_security_definer.sql` | user id for a phone/email |
| `auth_login_allowed(contact text)` | `0005` | may this contact receive a login code |
| `auth_memberships_for_user(user_id uuid)` | `0005` | memberships across schools for `GET /v1/me` and school switch |
| `auth_invitation_by_token_hash(hash text)` | `0005` | invitation lookup for accept |
| `billing_school_for_payment(provider text, provider_ref text)` | `0005` | school of a payment, for webhooks |
| `auth_release_push_token(push_token text)` | `0007_refresh_token_successor.sql` | removes a push token from another user's device row |
| `platform_list_statements(...)` | `0009_platform_statement_functions.sql` | platform admin statement list across schools |
| `platform_statement_school(statement_id uuid)` | `0009` | school of a statement, before `enterSchool` |
| `billing_count_webhook_failures(since timestamptz)` | `0026_named_definer_functions.sql` | webhook-failure count for the alert probe; non-zero only in a school-less scope |
| `auth_devices_for_school_members(user_ids uuid[])` | `0026` | push devices of the current school's members, for the notification dispatcher (`ListDevicesForUsersQuery`) |
| `auth_prune_device(device_id uuid, user_id uuid, seen_before timestamptz)` | `0026` | deletes a member's rejected push device from the worker (`DeviceTokenInvalidated`); no-op when `app.user_id` is set |
| `school_id_for_public_slug(slug text)` | `0030_public_profiles_rls.sql` | school of a published public page of an active school, for `GET /v1/public/schools/{slug}` (`ResolvePublicSchoolQuery`) |

Migration `0026` also drops the `devices_school_members` (0018) and `devices_school_members_prune` (0025) policies, so `devices` is back to the single `devices_own` policy of SPEC §6.1. The webhook-failure count no longer reads through `app_system`.

`billing_invoice_immutable()` and `billing_invoice_line_immutable()` in `0011` are triggers that block edits to issued invoices; they are not `SECURITY DEFINER`.

### Tests that guard this

| Test | Guards |
| --- | --- |
| [`test/db/security-definer.test.ts`](../apps/api/test/db/security-definer.test.ts) | Every `SECURITY DEFINER` function found in the migrations is in its list, is owned by the no-login role, returns exactly the listed columns, and leaks nothing across schools. |
| [`test/cross-tenant/routes.test.ts`](../apps/api/test/cross-tenant/routes.test.ts) | Every registered route and every OpenAPI operation has a cross-tenant fixture (a school B caller gets 404/403) or an allowlist entry in [`test/support/route-allowlist.ts`](../apps/api/test/support/route-allowlist.ts) for routes that carry no tenant data. |
| [`test/db/rls.test.ts`](../apps/api/test/db/rls.test.ts) | RLS enabled and forced with the SPEC predicate on every tenant table; `app_rw` sees nothing without `app.school_id`, cannot read or write another school's rows. |
| [`test/db/grants.test.ts`](../apps/api/test/db/grants.test.ts), [`test/db/migrations.test.ts`](../apps/api/test/db/migrations.test.ts) | Grants per role; role attributes (only `app_system` bypasses RLS); table ownership; bootstrap + migrate is idempotent. |

## 3. Migrations

- Schemas are in `apps/api/src/kernel/schema.ts` and `apps/api/src/modules/*/infra/schema.ts` ([`drizzle.config.ts`](../apps/api/drizzle.config.ts)); generated SQL goes to `apps/api/drizzle/` with snapshots and the journal in `drizzle/meta/`.
- Generate a migration from schema changes: `pnpm --filter @driveos/api db:generate`.
- Anything drizzle cannot express (EXCLUDE constraints, `SECURITY DEFINER` functions, grants, RLS policies, triggers) goes in a custom SQL migration: `pnpm --filter @driveos/api exec drizzle-kit generate --custom --name=<name>`, then edit the empty file. Examples: `0000_btree_gist.sql`, `0004_grants_rls.sql`, `0005_security_definer.sql`.
- Check that snapshots and the journal are consistent: `pnpm --filter @driveos/api exec drizzle-kit check`. It needs no database.
- Never edit a migration that is already on `master`. When rebasing onto `master`, delete your branch's generated migrations (SQL, snapshot and journal entries) and regenerate them.
- Apply on a fresh database: `db:reset` locally. For a new production database: create the empty database, run `db:bootstrap` with a superuser `DATABASE_ADMIN_URL`, then `db:migrate`. Migrations run as `driveos_owner`; `ALTER DEFAULT PRIVILEGES FOR ROLE driveos_owner` in `0004` gives `app_rw` and `app_system` access to tables created later, and later migrations revoke where a table needs less.
- Run `db:migrate` before starting new API/worker versions. There is no down migration; a bad migration is fixed forward or by restore (section 4).

## 4. Backups and point-in-time recovery

Target from SPEC §10: 99.9% API availability, daily backups with point-in-time recovery. Postgres is the only source of truth (SPEC §3.1). Nothing below is automated in the repo; the compose stack has no backups.

### Postgres 16 recommendation

1. **Use physical backups with WAL archiving**, either the managed provider's PITR (RDS/Aurora, Cloud SQL, Azure Flexible Server, Crunchy Bridge and similar) or, self-hosted, pgBackRest or WAL-G to object storage in another region/account.
2. **Base backup nightly**, full weekly and differential/incremental daily if the tool supports it.
3. **Continuous WAL archiving** (`archive_mode = on`, `archive_command` / `archive_library` from the tool, `wal_level = replica`). Set `archive_timeout = 60` so a quiet database still ships WAL at least every minute; that bounds data loss (RPO) to about a minute.
4. **Retention**: at least 14 days of PITR window, plus monthly base backups kept 12 months. Invoices and payments must survive longer than the PITR window; check local legal retention with the accountant (section 9).
5. **Encrypt** backups at rest and restrict who can read them; they contain personal data of minors.
6. **Also take a daily logical dump** (`pg_dump -Fc`) as a second, tool-independent copy. Roles are cluster-level and are not in `pg_dump`; dump them with `pg_dumpall --roles-only` (without passwords if your policy requires) or recreate them with `db:bootstrap`.
7. **Test restores monthly**: restore the latest base backup plus WAL to a scratch instance at a chosen timestamp, run the checks in step 7 of the procedure below, record the time it took (RTO), and delete the instance.

### Restore procedure

1. Stop writers: scale the API and worker to zero (or put the proxy in maintenance mode). Note the target time in UTC.
2. Restore into a **new** instance, never over the damaged one: base backup taken before the target, then replay WAL up to it (`recovery_target_time = '<UTC timestamp>'`, `recovery_target_action = 'promote'`; with pgBackRest: `pgbackrest restore --type=time --target="<timestamp>"`; managed providers: "restore to point in time").
3. After promotion, confirm the roles exist with the right attributes: `\du` should show `driveos_owner`, `app_rw`, `app_system` (Bypass RLS), `driveos_definer` (Cannot login, Bypass RLS). A physical restore includes them. A logical restore does not: run `pnpm --filter @driveos/api db:bootstrap` with the four URLs pointing at the new instance before loading the dump (it sets passwords from the URLs and makes `driveos_owner` the database owner), then `pg_restore` as `driveos_owner`.
4. Run `db:migrate` against the restored database; it should report nothing to apply if the restore point is after the last deploy.
5. Re-point `DATABASE_URL`, `DATABASE_SYSTEM_URL` (API and worker) and, for tooling, `DATABASE_OWNER_URL` / `DATABASE_ADMIN_URL` at the new instance. Rotate the role passwords if the old instance was compromised.
6. Redis after a restore to an earlier time: BullMQ still holds jobs for events that no longer exist in the restored database. Before starting the worker, either delete the BullMQ keys under the `JOBS_PREFIX` (for example `redis-cli --scan --pattern 'driveos:*'` piped to `DEL`, against the production Redis, after checking the pattern) or start the worker with a new `JOBS_PREFIX`. Lesson reminders are then lost (see below).
7. Start one worker, then the API. Check: `GET /v1/health`; `GET /v1/platform/alerts` after one `ALERTS_INTERVAL_MS`; `select count(*) from outbox where published_at is null` drains; `select count(*) from dead_letters`; sign in with a known account and open a student balance and an invoice PDF.
8. Reconcile with outside systems for the gap between the restore point and the incident: payments the provider confirmed (re-send webhooks from the provider dashboard once a real provider exists), documents uploaded to object storage after the restore point (objects without rows), and messages already sent.

### What else to back up

| Store | Contents | Backup |
| --- | --- | --- |
| Object storage (MinIO in dev, bucket `S3_BUCKET`, default `driveos-documents`) | Student documents and contract files, theory media. The adapter creates the bucket on first use and turns on default server-side encryption ([`s3-object-storage.ts`](../apps/api/src/adapters/storage/s3-object-storage.ts)). | Versioning plus replication or `mc mirror` to a second site; keep at least as long as the database PITR window. |
| `MINIO_KMS_SECRET_KEY` (root `.env`) | The key MinIO uses to encrypt objects at rest. **Losing it loses every document**; a bit-level copy of the MinIO data directory is unreadable without it. | Store it in the secrets manager, separate from the object backups, with its own backup. In production prefer a real KMS (MinIO KES or the cloud provider's SSE-KMS) over a static key. |
| Redis | BullMQ queues, rate-limit counters, the current alert state. | Not backed up; treat as disposable. |
| Secrets (section 5) | JWT secret, code pepper, DB passwords, storage keys. | Secrets manager with history. Losing `AUTH_JWT_SECRET` logs everyone out; losing `AUTH_CODE_PEPPER` invalidates pending login codes. |

**What is lost if Redis is lost:**

- Delayed lesson reminders (queue `reminders`, 24 h and 2 h before each lesson). They are scheduled by the `LessonBooked`/move subscriber and nothing rebuilds them. Notifications that are already stored in Postgres are sent by `messaging.notification-dispatch`, which reads the database, so those are not lost.
- Event jobs not yet run. The outbox relay marks events `published_at` once it has enqueued them. The hourly `kernel.delivery-reconcile` job re-enqueues events published 1 to 25 hours ago that have no `event_deliveries` row and no `dead_letters` row for a subscriber, so lost event jobs are re-delivered within about two hours. Events published more than 25 hours before the loss are not picked up.
- Job schedulers: the worker re-registers them on start (`upsertJobScheduler`).
- Rate-limit windows (reset) and the alert state (re-evaluated on the next `platform.alerts` run; the `since` timestamps restart).

## 5. Environment variables

The API and worker validate `apps/api/.env` with the zod schema in [`apps/api/src/kernel/config/env.ts`](../apps/api/src/kernel/config/env.ts) and refuse to start on an invalid value. Secrets marked "rotate" must be replaced in production; the `dev-only-...` values in the examples are public.

### Root `.env` (compose only)

| Variable | Meaning | Production |
| --- | --- | --- |
| `POSTGRES_PORT`, `REDIS_PORT`, `MINIO_API_PORT`, `MINIO_CONSOLE_PORT`, `MAILPIT_SMTP_PORT`, `MAILPIT_UI_PORT` | Host ports | Compose is for development; production uses managed services. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Compose superuser and database | Rotate; never give the superuser to the app. |
| `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` | MinIO root credentials | Rotate; give the app a scoped access key instead of root. |
| `MINIO_KMS_SECRET_KEY` | MinIO at-rest encryption key (`name:base64`) | Back up separately (section 4); prefer a real KMS. |

### `apps/api/.env`

| Variable | Default | Meaning | Production |
| --- | --- | --- | --- |
| `NODE_ENV` | required | `development`, `test`, `production` | `production`. Disables the fake-pay page (404), stops returning invitation accept tokens in API responses and hides `/docs` unless `OPENAPI_UI_ENABLED=true`; dev headers already work only under `test`. |
| `API_PORT` | required | HTTP port | Behind a TLS-terminating proxy. |
| `LOG_LEVEL` | required | pino level | `info`. |
| `ADMIN_ORIGIN` | required | Single CORS origin | The admin app's https origin. |
| `APP_PUBLIC_URL` | `http://localhost:15173` | Base of links in invitation and guardian-consent messages | Public admin/app URL. |
| `API_PUBLIC_URL` | `http://localhost:${API_PORT}` | Public base URL of the API; the fake payment provider builds its `/fake-pay/...` checkout links on it | Public https API URL. |
| `OPENAPI_UI_ENABLED` | `true` outside production, `false` in production | Serves Swagger UI at `/docs` and the OpenAPI JSON at `/docs-json` | Leave unset (off). If turned on, restrict `/docs*` at the proxy. `pnpm generate` does not depend on it. |
| `DATABASE_URL` | required | `app_rw` connection | Per-environment password; TLS (`sslmode=require` or stricter). |
| `DATABASE_SYSTEM_URL` | required | `app_system` connection | Same; rotate. |
| `DATABASE_OWNER_URL` | optional (required by db scripts) | `driveos_owner`, migrations | Only in the migration job, not in API/worker. |
| `DATABASE_ADMIN_URL` | optional (required by db scripts) | Superuser, bootstrap/reset | Only for bootstrap; never in API/worker. |
| `REDIS_URL` | required | BullMQ, rate limits, alert state | Private network, auth, TLS (`rediss://`). |
| `JOBS_PREFIX` | `driveos` | Redis key prefix for queues, rate limits, alerts | One per environment sharing a Redis. |
| `OUTBOX_POLL_MS` | 500 | Relay sleep when the outbox is empty | Keep; lower raises DB load. |
| `EVENT_BACKOFF_DELAY_MS` | 1000 | First retry delay for event jobs | Keep. |
| `EVENT_BACKOFF_MAX_MS` | 300000 | Retry delay cap (doubling) | Keep. |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` | required | Object storage | Provider endpoint; bucket per environment. |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | required | Storage credentials | Rotate; scope to the bucket. |
| `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM` | required | Email sender (Mailpit in dev) | Transactional email service; verified sender domain. |
| `MAILPIT_API_URL` | `http://localhost:18025` | Used only by tests | Not needed. |
| `AUTH_JWT_SECRET` | required, min 32 chars | Signs access tokens | Rotate; random 32+ bytes. Rotation logs everyone out. |
| `AUTH_CODE_PEPPER` | required, min 32 chars | HMAC pepper for login codes and contact rate-limit keys | Rotate; random 32+ bytes. |
| `AUTH_ACCESS_TTL_SECONDS` | 900 | Access token lifetime | Keep. |
| `AUTH_REFRESH_TTL_WEB_DAYS` / `_MOBILE_DAYS` | 30 / 90 | Refresh token lifetime | Keep. |
| `AUTH_CODES_PER_CONTACT` / `AUTH_CODES_CONTACT_WINDOW_SECONDS` | 3 / 900 | Login codes per contact per window | Keep. |
| `AUTH_CODES_PER_IP` / `AUTH_CODES_IP_WINDOW_SECONDS` | 20 / 3600 | Login codes per IP per window | Keep; depends on correct `HTTP_TRUST_PROXY`. |
| `AUTH_CODES_PER_PREFIX_PER_DAY` | 500 | Login codes per phone prefix per day (SMS pumping guard) | Tune per launch country. |
| `FAKE_PAYMENT_SECRET` | dev value | HMAC secret of the fake payment webhooks | Rotate even though the fake page is off in production. |
| `HTTP_TRUST_PROXY` | `loopback` | Express `trust proxy` (`true`/`false`, hop count, or address list) | Set to the proxy's addresses or hop count. Wrong values make every client share one IP for rate limits, or let clients spoof `X-Forwarded-For`. |
| `RATE_LIMIT_ENABLED` | true | Master switch | `true`. |
| `RATE_LIMIT_*_LIMIT` / `RATE_LIMIT_*_WINDOW_SECONDS` | see section 7 | Per-policy limits | Keep, tune after load tests. |
| `ALERTS_INTERVAL_MS` | 60000 | How often `platform.alerts` runs | Keep. |
| `ALERT_DEAD_LETTERS_THRESHOLD` | 0 | Fires when dead letters > threshold | Keep 0. |
| `ALERT_OUTBOX_LAG_SECONDS` | 60 | Oldest unpublished outbox row age | Keep (SPEC §10). |
| `ALERT_WEBHOOK_FAILURES_THRESHOLD` / `_WINDOW_SECONDS` | 0 / 900 | Failed payment webhooks within the window | Keep. |
| `ALERT_SYNC_BACKLOG_SECONDS` | 60 | Oldest event not yet applied to `change_feed` | Keep. |

### `apps/admin/.env` and `apps/mobile/.env`

| Variable | Meaning | Production |
| --- | --- | --- |
| `ADMIN_PORT` | Vite dev/preview port (required by [`vite.config.ts`](../apps/admin/vite.config.ts)) | Not used by a static build. |
| `VITE_API_URL` | API base URL (validated in [`apps/admin/src/env.ts`](../apps/admin/src/env.ts)) | Public https API URL. |
| `VITE_USE_MOCKS` | `true` uses the in-browser mock API | `false`. |
| `EXPO_PUBLIC_API_URL` | API base URL for the mobile app ([`apps/mobile/src/config.ts`](../apps/mobile/src/config.ts)) | Public https API URL. |
| `EXPO_PUBLIC_USE_MOCKS` | `true` uses the in-app mock API | `false`. |

`VITE_*` and `EXPO_PUBLIC_*` values are compiled into the client bundles; never put secrets in them.

## 6. Worker, queues and the outbox

`worker.ts` boots [`WorkerModule`](../apps/api/src/worker.module.ts) (the kernel worker module plus every module's `*-worker.module.ts`) with no HTTP server. On start ([`kernel/worker/worker-lifecycle.ts`](../apps/api/src/kernel/worker/worker-lifecycle.ts)) it starts the scheduled-job worker, the events worker, the queue processors and the outbox relay loop, and logs `worker started` with the prefix, subscriber names, scheduled jobs and queues. Production entry points: `pnpm --filter @driveos/api start` and `start:worker` after `build`.

### Queues

All BullMQ queues use the prefix `JOBS_PREFIX` ([`kernel/jobs/queues.ts`](../apps/api/src/kernel/jobs/queues.ts)).

| Queue | Content | Concurrency per worker |
| --- | --- | --- |
| `events` | One job per (subscriber, event), `jobId = <subscriber>/<eventId>`, 10 attempts, bounded exponential backoff from `EVENT_BACKOFF_DELAY_MS` doubling to `EVENT_BACKOFF_MAX_MS`. Completed jobs removed, failed jobs kept. | 4 |
| `scheduled` | Repeatable jobs below | 1 |
| `reminders` | Delayed lesson reminders, `jobId = <lessonId>/<24h|2h>`, 3 attempts | 4 |

### Scheduled jobs (cron in UTC)

| Name | Schedule | Does | DB role |
| --- | --- | --- | --- |
| `kernel.outbox-relay-tick` | every 60 s | Safety net for the relay loop | `app_system` |
| `kernel.delivery-reconcile` | `0 * * * *` | Re-enqueue undelivered events (section 4) | `app_system` |
| `kernel.idempotency-purge` | `30 * * * *` | Delete idempotency keys older than 24 h | `app_system` |
| `platform.alerts` | every `ALERTS_INTERVAL_MS` | Evaluate alert probes (section 7) | `app_system` |
| `messaging.notification-dispatch` | every 30 s | Send due notifications per school | `app_rw` per school |
| `messaging.chat-retention` | `30 3 * * *` | Purge chat messages past retention per school | `app_rw` per school |
| `training.lead-purge` | `15 3 * * *` | Delete `lost`/`converted` leads closed over 12 months ago; null `request_ip_hash` after 30 days | `app_rw` per school |
| `scheduling.slot-offer-expiry` | every 60 s | Expire slot offers | per school |
| `scheduling.slot-offer-gap-scan` | `0 2 * * *` | Find gaps and create fill-the-gap offers | per school |
| `reporting.growth-report` | `0 * * * *` | Generate last month's growth report once it is due in the school's time zone | `app_rw` per school |
| `billing.monthly-statements` | `0 2 1 * *` | Issue platform statements for the previous month | `app_rw` per school |

"Per school" jobs list non-suspended schools as `app_system`, then run each school in its own `app_rw` transaction; one school's failure is logged (`per-school job failed`, with `schoolId`) and does not stop the others. The worker deletes schedulers in Redis that it does not know, so during a rolling deploy an old and a new worker can briefly remove each other's new or retired schedules; the next start corrects it.

### Outbox relay and delivery

- Command handlers insert events into `outbox` in the request transaction. The relay loop ([`kernel/outbox/relay.ts`](../apps/api/src/kernel/outbox/relay.ts)) selects `published_at is null order by seq limit 100 for update skip locked` as `app_system`, enqueues one job per subscriber, then sets `published_at`. It repeats until a batch is short, then sleeps `OUTBOX_POLL_MS`.
- Each job ([`event-delivery.ts`](../apps/api/src/kernel/subscribers/event-delivery.ts)) inserts `event_deliveries(subscriber, event_id)` as `app_system` (a conflict means already handled: skip), then runs the handler in an `app_rw` transaction scoped to the event's school. The handler commits before the claim row does, so a crash between the two commits can run a handler twice: delivery is at least once, and handlers must be idempotent (projections compare `aggregate_version`).
- After the 10th failed attempt the job writes a row to `dead_letters` (`subscriber`, `event_id`, `error` with stack, `attempts`, `failed_at`) and logs an error with `alert: "dead_letter"`, `subscriber`, `eventId`, `eventType`, `schoolId`.
- **Inspecting dead letters:**

  ```sql
  select d.failed_at, d.subscriber, o.type, o.school_id, d.attempts, left(d.error, 200)
    from dead_letters d join outbox o on o.id = d.event_id
   order by d.failed_at desc;
  ```

- **No replay tool exists.** A manual replay has to remove the `dead_letters` row and make BullMQ run the job again; because failed event jobs are kept under the same `jobId`, re-adding that id is ignored while the failed job exists, so the failed job must be retried or removed in BullMQ. The reconciler only considers events published 1 to 25 hours ago. Rehearse this on staging before relying on it.

### How many workers

Several worker processes may run against the same database and Redis:

- `FOR UPDATE SKIP LOCKED` lets relays take disjoint batches. Ordering across subscribers is not guaranteed anyway (jobs run concurrently).
- BullMQ `jobId`s deduplicate event and reminder jobs, and a scheduler fires each tick on one worker only.
- `event_deliveries` makes repeated deliveries a no-op, and the `change_feed` projection takes a per-school advisory lock (SPEC §3.5).

Run at least two workers for availability. Each worker and API process opens two `pg` pools (default 10 connections each); size Postgres `max_connections` or a pooler accordingly. With a transaction-mode pooler, `set_config(..., true)` is transaction-scoped and safe; advisory locks used by projections must be checked against the pooler mode first.

## 7. Alerts and rate limits

### Alerts

The `platform.alerts` job ([`kernel/alerts/alert-monitor.ts`](../apps/api/src/kernel/alerts/alert-monitor.ts)) runs every `ALERTS_INTERVAL_MS`. An alert fires when the measured value is greater than its threshold.

| Alert | Measures | Threshold env |
| --- | --- | --- |
| `dead_letters` | Total rows in `dead_letters` (school of the newest one attached) | `ALERT_DEAD_LETTERS_THRESHOLD` (0) |
| `outbox_lag` | Age in seconds of the oldest unpublished outbox row | `ALERT_OUTBOX_LAG_SECONDS` (60) |
| `webhook_failures` | Rows in `payment_webhook_failures` within the window (bad signature, unknown payment, handler error) | `ALERT_WEBHOOK_FAILURES_THRESHOLD` (0), `ALERT_WEBHOOK_FAILURES_WINDOW_SECONDS` (900) |
| `sync_backlog` | Age in seconds of the oldest event of the last 24 h not yet applied by the `change_feed` projection (and not dead-lettered) | `ALERT_SYNC_BACKLOG_SECONDS` (60) |

Where to see them:

- `GET /v1/platform/alerts` (permission `platform.manage`, platform admins) returns the current state, stored in Redis under `<JOBS_PREFIX>:alerts:current`.
- The worker logs a `warn` line `alert raised` / `alert cleared` with `alert`, `value`, `threshold`, `schoolId` on each transition, and `alert probe failed` at `error` if a probe throws. Route these log lines to the paging system; nothing pages today.

### Rate limits

[`kernel/http/rate-limit.guard.ts`](../apps/api/src/kernel/http/rate-limit.guard.ts) counts in Redis (`INCR` + `EXPIRE NX`, fixed windows) under `<JOBS_PREFIX>:ratelimit:...` and answers `429 rate_limited` with `Retry-After`. It uses a separate fail-fast Redis client (250 ms command timeout, one retry), so when Redis is unreachable the check is skipped (fail open) and the API logs one `warn` line `rate limit check skipped: redis unavailable` until a check succeeds again.

| Policy | Applied to | Key | Default |
| --- | --- | --- | --- |
| `auth` | all `/v1/auth/*` routes (code, verify, refresh, logout) | IP + route | 30 / 300 s |
| `auth-contact` | `POST /v1/auth/verify` (in addition) | HMAC of the contact | 10 / 900 s |
| `invitations` | `POST /v1/invitations/{token}/accept` | IP + route | 20 / 900 s |
| `webhooks` | `POST /v1/webhooks/payments/{provider}` | IP + route | 600 / 60 s |
| `fake-pay` | `/fake-pay/*` | IP + route | 60 / 60 s |
| `health` | `GET /v1/health` | IP | 600 / 60 s |
| `public-page` | `GET /v1/public/schools/{slug}` (public enrolment page) | IP + route | 120 / 3600 s |
| `leads` | `POST /v1/public/schools/{slug}/leads` (public enquiry form) | IP + route | 10 / 3600 s |

Login-code issuance has its own limits on top (`AUTH_CODES_*`, enforced by the identity module). Authenticated routes have no per-user rate limit.

### Known gaps

- Swagger UI (`/docs`) and the OpenAPI JSON (`/docs-json`) are off in production unless `OPENAPI_UI_ENABLED=true` ([`http-app.ts`](../apps/api/src/http-app.ts)); when on, they have no auth or rate limit, so restrict them at the proxy.
- `payment_webhook_failures` is never purged; it grows with every failed webhook.
- The `dead_letters` alert counts all rows ever written, so it clears only when the rows are deleted, which today is a manual step.

## 8. Observability

- **Logs:** pino JSON lines on stdout through `nestjs-pino` ([`kernel/logging/`](../apps/api/src/kernel/logging/)), level `LOG_LEVEL`. Each HTTP request logs `reqId` (from a valid incoming `x-request-id` header, otherwise a new UUID, echoed in the response header), `req.method`, `req.url` and `res.statusCode`. Unhandled errors (5xx) are logged with the stack by the exception filter.
- **Context fields:** request logs do **not** carry `school_id` or `user_id` today. Worker logs add `schoolId`, `eventId`, `subscriber` or `job` only where the code puts them (dead letters, per-school job failures, alerts). SPEC §10 asks for `school_id`, request id and event id on every line; that is not complete.
- **Health:** `GET /v1/health` returns `{ "status": "ok", "service": "api" }`. It is a liveness check only; it does not test Postgres or Redis. The worker has no health endpoint; watch its logs and the `outbox_lag` alert.
- **Error tracking:** none is wired (no Sentry or OpenTelemetry). The natural places are the exception filter ([`kernel/http/api-exception.filter.ts`](../apps/api/src/kernel/http/api-exception.filter.ts)), `EventDelivery.deadLetter`, and the scheduled-job and per-school failure handlers.
- **Do not ship dev adapter logs:** the console SMS adapter logs the full message body, which contains login codes, and the console push adapter logs tokens.

## 9. Payments and fiscalisation for Albania and Kosovo

### What exists

| Area | State |
| --- | --- |
| `PaymentProvider` interface (`connectAccount`, `createCheckout`, `refund`, `verifyWebhook`) | Implemented ([`adapters/payments/payment-provider.ts`](../apps/api/src/adapters/payments/payment-provider.ts)). |
| Provider implementation | Only `FakePaymentProvider`: local pay page at `/fake-pay/{ref}`, HMAC-SHA256 signed webhooks with `FAKE_PAYMENT_SECRET`. Its base URL is hard-coded to `http://localhost:${API_PORT}`. In production the page returns 404, so in-app payment does not work until a real provider is wired. |
| Merchant of record | The school (SPEC §11 D1). Checkout uses the school's connected account; DriveOS never holds student money. |
| Webhooks | `POST /v1/webhooks/payments/{provider}` verifies the signature through the adapter, finds the school with `billing_school_for_payment`, records failures in `payment_webhook_failures`. |
| Cash and bank transfer | Implemented: `POST /v1/payments/cash` takes `method: cash | bank_transfer`; platform statements are marked paid by bank transfer or cash. |
| Currency | Every amount row has a currency; each school has a currency. |
| Invoices | `InvoicePolicy` interface ([`adapters/invoices/invoice-policy.ts`](../apps/api/src/adapters/invoices/invoice-policy.ts)) with the dev `GenericEuInvoicePolicy`: one series per calendar year in the school's time zone, numbers `YYYY-000001`, gapless per series (`invoice_counters`), tax included in gross, simple PDF. |
| Corrections | Issued invoices are immutable (database triggers); corrections are credit notes. |
| Tax ids | `schools.tax_id` exists and is snapshotted as seller data. Buyers have no tax id field. |

### TODO

Everything below is to confirm with a local accountant and a certified fiscalisation provider before building; none of it is implemented.

1. **Payment provider.** Stripe is not available to merchants in Albania or Kosovo. Choose a local or regional PSP and implement it behind `PaymentProvider`, including webhook signature verification and per-school accounts (school as merchant). Candidates to evaluate, not chosen: bank card gateways of Raiffeisen, BKT or ProCredit; Paysera; Payten/Asseco; a regional aggregator. Until then, schools use cash and bank transfer, which already work. Also make the provider's base/return URLs configurable instead of `localhost`.
2. **Albania: fiscalisation.** Albania requires real-time fiscalisation of invoices through certified software connected to the tax authority's central platform (DPT, Drejtoria e Përgjithshme e Tatimeve; "eFiskalizimi"). Each invoice is expected to carry codes issued in that flow (NSLF and NIVF) and a verification QR code. Needed: an `InvoicePolicy` implementation backed by a certified provider (registration before issue, codes and QR on the PDF, offline/late-registration handling), and a mapping of the "credit notes only" rule to the fiscal corrective-invoice flow. To confirm: exact data fields, business-unit and device codes, numbering format, deadlines for late registration, and B2B e-invoice requirements.
3. **Kosovo: fiscal devices and VAT.** Kosovo's tax administration (ATK, Administrata Tatimore e Kosovës) requires fiscal cash registers or certified fiscal electronic devices/software for cash sales, plus VAT invoicing rules. Needed: decide whether cash recorded in DriveOS must also go through a fiscal device, or the school keeps issuing fiscal receipts outside DriveOS; an `InvoicePolicy` for Kosovo. To confirm: which sales must be fiscalised, device certification, invoice content.
4. **Tax identifiers.** Seller NUIS/NIPT (Albania) or fiscal/VAT number (Kosovo) can use `schools.tax_id`; add a buyer tax id for business buyers, and validation of the formats.
5. **Currency.** ALL for Albanian schools, EUR for Kosovo schools. The schema already stores currency per school and per row; check ALL minor-unit handling and PDF formatting.
6. **Numbering.** Official invoice numbering per fiscal year and per business unit/device as the fiscal rules require; the generic policy's `YYYY-000001` series is a placeholder.
7. **Retention.** Legal retention period for invoices and payment records, which drives backup retention (section 4).

## 10. Seed and demo data

`db:seed` ([`scripts/db/seed.ts`](../apps/api/scripts/db/seed.ts), data in [`seed-data.ts`](../apps/api/scripts/db/seed-data.ts)) creates, with fixed UUIDv7-shaped ids:

- Global (as `app_system`): the 11 users in section 1, Petra as platform admin, plans `solo` and `standard`, and the SAMPLE question pack `packs/sample-B-en.json`, published.
- Two schools, both EUR, as `app_rw` with `app.school_id` set: **Fahrschule Spree** (DE, Europe/Berlin) and **Escola de Condução Tejo** (PT, Europe/Lisbon). Each gets settings, a branch, opening hours, a subscription, memberships, vehicles, three lesson types (standard, night drive, driving exam), instructor availability, syllabus items B01 to B08 and four price items (single lesson, 10-lesson package, premium theory, car for the exam).
- Fahrschule Spree only: five students with enrolments, all assigned to Ingo, rows in `rm_student_list`, Gustav linked as Mia's guardian without consent (Mia's membership is `pending_consent`; her date of birth is computed from today so she is always 16), and sample chat conversations.

Properties:

- **Idempotent:** every insert is `on conflict do nothing`, so re-running changes nothing (it also does not update rows that changed since).
- It writes rows directly and emits **no outbox events**; read models are seeded directly. No lessons, payments or ledger entries are seeded; create them through the API.
- Reset: `pnpm --filter @driveos/api db:reset && pnpm --filter @driveos/api db:seed`.
- Never run it against production.

Question packs: `pnpm --filter @driveos/api question-bank:import <pack.json> [--publish]` validates a JSON pack (SPEC §9 format) and imports it as a draft through the theory command handlers, publishing it with `--publish`. Samples: `apps/api/packs/sample-B-en.json` (`fraction` rules) and `sample-error-points-B-en.json` (`error_points` rules). They contain made-up questions; real content must come from the licensing authority.

Dev adapters ([`apps/api/src/adapters/`](../apps/api/src/adapters/)):

| Adapter | Dev behaviour |
| --- | --- |
| Payments | `FakePaymentProvider`: open the checkout URL `http://localhost:13000/fake-pay/{ref}`, choose succeed or fail; the page signs and posts the webhook to the API. |
| SMS | Logs `sms (console adapter)` with recipient and body to the process log. |
| Push | Logs `push (console adapter)`. |
| Email | SMTP to Mailpit; read at http://localhost:18025. |
| Storage | S3 client against MinIO (console http://localhost:19001, root credentials from the root `.env`). |
| Invoices | `GenericEuInvoicePolicy` (section 9). |
| Exam rules | `fraction` and `error_points`. |

## 11. Known gaps

- No real payment, SMS, push or email providers; the fake payment page is disabled in production, so in-app payment does not work there yet.
- Launch-country decisions in SPEC §12 are open: country, question-bank source, invoice and e-invoicing rules, payment provider, SMS sender rules, exam languages, age of majority.
- Albanian and Kosovar fiscalisation not implemented (section 9).
- No backup automation or tested restore runbook in the repo; the compose stack has no backups.
- No dead-letter replay tool; the dead-letter alert clears only by deleting rows.
- Lesson reminders live only in Redis and are not rebuilt after Redis loss.
- `payment_webhook_failures` is never purged.
- Swagger UI and `/docs-json` are public and not rate limited.
- The rate limiter waits rather than failing open when Redis is down.
- Request logs lack `school_id`/`user_id`; no error tracking; health check does not test dependencies; worker has no health endpoint.
- Alerts are only logs and an API endpoint; nothing pages anyone.
- The CI workflow ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) has never run on GitHub.

## 12. Load test results

Two scripts in [`apps/api/scripts/load/`](../apps/api/scripts/load/) run against a running API and worker (`pnpm --filter @driveos/api dev`). They read the database URLs and `AUTH_JWT_SECRET` from `apps/api/.env` and take `API_URL` (default `http://localhost:13000`). Each run creates its own school ("Load test …") through the admin database connection and signs access tokens with the API's JWT secret, so it never touches the seeded schools. The rows stay until the next `db:reset`. Both scripts print a results table and exit `1` when an invariant fails. Do not run them while `db:reset`/`db:seed` runs.

| Command | Parameters (env, defaults) | Checks |
| --- | --- | --- |
| `pnpm --filter @driveos/api load:booking` | `SAME_SLOT_STUDENTS=50`, `BALANCE_ATTEMPTS=30`, `BALANCE_LESSONS=5`, `MIXED_SLOT_STUDENTS=25`, `MIXED_ATTEMPTS=15`, `MIXED_LESSONS=4` | Students book their own lessons with `POST /v1/lessons` (`Idempotency-Key` per request), all requests in a scenario at once. Same slot (one instructor, one vehicle): exactly one `201`, the rest `409 lesson_conflict`. One student with credit for K lessons booking M different slots: exactly K `201`, the rest `409 insufficient_balance`, then `GET /v1/students/{id}/balance` and `SUM(ledger_entries.minutes)` are both 0. A mixed burst runs both patterns on the same instructor at the same time. Afterwards: no overlapping `booked`/`completed` lessons per instructor, vehicle or student (`period && period`), no student with a negative ledger sum, the lowest balance sampled every 10 ms during the run is never below 0, and the number of booked lessons is as expected. |
| `pnpm --filter @driveos/api load:relay` | `RELAY_EVENTS=2000`, `RELAY_MAX_SECONDS=60` | Inserts N `VehicleChanged` events for one school straight into `outbox` in one statement. Then it waits until the running worker has published all of them and recorded an `event_deliveries` row for each one from `scheduling.change-feed`. Reports throughput and lag (`published_at - created_at`, `delivered_at - created_at`). Fails if the drain takes longer than `RELAY_MAX_SECONDS` or any event is dead-lettered. |

Results from 2026-10-12, Apple M4 (10 cores, 24 GB) running the compose Postgres 16 and Redis on OrbStack. The API and worker were the `node --watch` dev processes (`OUTBOX_POLL_MS=500`, events concurrency 4). There were three runs of each script; the table shows the range.

| Scenario | Requests | Outcome (every run) | p50 ms | p95 ms |
| --- | --- | --- | --- | --- |
| Same slot | 50 | 1 × `201`, 49 × `409 lesson_conflict` | 87–147 | 134–197 |
| One student, credit for 5 | 30 | 5 × `201`, 25 × `409 insufficient_balance`; balance 0 | 63–78 | 84–107 |
| Mixed: same slot | 25 | 1 × `201`, 24 × `409 lesson_conflict` | 56–75 | 76–95 |
| Mixed: one student, credit for 4 | 15 | 4 × `201`, 11 × `409 insufficient_balance`; balance 0 | 105–120 | 118–126 |

In every booking run there were 0 overlapping lessons, 0 negative balances, the lowest sampled balance was 0, and 11 of 11 lessons were booked. A first run right after the API process had started was slower (same slot p50 508 ms, p95 908 ms) and returned the same outcome.

| Relay run | Events | All published after | Drained after | Throughput | p95 / max delivery lag | Dead letters |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 2,000 | 0.36 s | 3.8 s | 523 events/s | 3.6 s / 3.7 s | 0 |
| 2 | 2,000 | n/a (not captured) | 3.4 s | 587 events/s | 3.2 s / 3.3 s | 0 |
| 3 | 2,000 | n/a (not captured) | 4.1 s | 491 events/s | 3.8 s / 4.0 s | 0 |

The first relay run of the day, on a worker that had just started, took 12.5 s (160 events/s). The relay publishes 100 events per batch; the delivery lag is mostly queueing behind the change-feed projection, which applies events one at a time per school (`serializePerSchool`). A burst in one school therefore drains at roughly 500 events/s on this machine; events of different schools are not serialized against each other.

The end-to-end smoke test ([`apps/api/test/e2e/smoke.test.ts`](../apps/api/test/e2e/smoke.test.ts)) runs in the normal API suite. It takes 15–75 s, most of it spent waiting for the booked lesson's start minute before the offline completion.
