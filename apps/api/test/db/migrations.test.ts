import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrap, loadDbToolEnv, migrateDatabase } from '../../scripts/db/lib.js';
import { connect, createScratchDatabase, type ScratchDatabase } from './scratch-database.js';
import { ALL_TABLES, GLOBAL_TABLES, TENANT_TABLES_WITH_SCHOOL_ID } from './spec-tables.js';

describe('migrations on an empty database', () => {
  let db: ScratchDatabase;
  let client: pg.Client;

  beforeAll(async () => {
    db = await createScratchDatabase();
    client = await connect(db.adminUrl);
  }, 60_000);

  afterAll(async () => {
    await client?.end();
    await db?.drop();
  });

  it('creates exactly the SPEC §6.1 tables in public', async () => {
    const { rows } = await client.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' order by tablename`,
    );
    expect(rows.map((r) => r.tablename)).toEqual(ALL_TABLES);
    expect(ALL_TABLES).toHaveLength(76);
  });

  it('makes driveos_owner the owner of every table', async () => {
    const { rows } = await client.query<{ tableowner: string }>(
      `select distinct tableowner from pg_tables where schemaname = 'public'`,
    );
    expect(rows).toEqual([{ tableowner: 'driveos_owner' }]);
  });

  it('gives every tenant table a non-null school_id referencing schools(id)', async () => {
    const { rows } = await client.query<{ table_name: string }>(
      `select c.relname as table_name
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
         join pg_attribute a on a.attrelid = c.oid and a.attname = 'school_id' and a.attnotnull
         join pg_constraint fk on fk.conrelid = c.oid and fk.contype = 'f'
                              and fk.confrelid = 'public.schools'::regclass
                              and fk.conkey = array[a.attnum]
        where c.relkind = 'r'`,
    );
    const tenantRows = rows.map((r) => r.table_name).filter((t) => !GLOBAL_TABLES.has(t));
    expect(tenantRows.sort()).toEqual(TENANT_TABLES_WITH_SCHOOL_ID);
  });

  it('adds created_at and updated_at (timestamptz not null default now()) to every table', async () => {
    const { rows } = await client.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
        where table_schema = 'public' and column_name in ('created_at', 'updated_at')
          and data_type = 'timestamp with time zone' and is_nullable = 'NO'
          and column_default = 'now()'`,
    );
    for (const column of ['created_at', 'updated_at']) {
      expect(
        rows
          .filter((r) => r.column_name === column)
          .map((r) => r.table_name)
          .sort(),
      ).toEqual(ALL_TABLES);
    }
  });

  it('names every enum type <table>_<column> after the column that uses it', async () => {
    const { rows } = await client.query<{ type_name: string; usage: string }>(
      `select t.typname as type_name, c.table_name || '_' || c.column_name as usage
         from pg_type t
         join information_schema.columns c on c.udt_name = t.typname and c.table_schema = 'public'
        where t.typtype = 'e'`,
    );
    expect(rows.length).toBeGreaterThan(30);
    for (const row of rows) expect(row.type_name).toBe(row.usage);
  });

  it('installs btree_gist and the three lesson EXCLUDE constraints', async () => {
    const ext = await client.query(`select 1 from pg_extension where extname = 'btree_gist'`);
    expect(ext.rowCount).toBe(1);
    const { rows } = await client.query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid = 'public.lessons'::regclass and contype = 'x' order by conname`,
    );
    expect(rows.map((r) => r.def)).toEqual([
      "EXCLUDE USING gist (instructor_membership_id WITH =, period WITH &&) WHERE ((status = ANY (ARRAY['booked'::lessons_status, 'completed'::lessons_status])))",
      "EXCLUDE USING gist (student_id WITH =, period WITH &&) WHERE ((status = ANY (ARRAY['booked'::lessons_status, 'completed'::lessons_status])))",
      "EXCLUDE USING gist (vehicle_id WITH =, period WITH &&) WHERE (((status = ANY (ARRAY['booked'::lessons_status, 'completed'::lessons_status])) AND (vehicle_id IS NOT NULL)))",
    ]);
  });

  it('creates every unique key listed in SPEC §6.1', async () => {
    const { rows } = await client.query<{ def: string }>(
      `select regexp_replace(pg_get_indexdef(i.indexrelid), '^CREATE UNIQUE INDEX \\S+ ON public\\.', '') as def
         from pg_index i
         join pg_class t on t.oid = i.indrelid and t.relnamespace = 'public'::regnamespace
        where i.indisunique and not i.indisprimary`,
    );
    expect(rows.map((r) => r.def).sort()).toEqual(
      [
        'contract_signatures USING btree (contract_id, signer_role)',
        'contract_templates USING btree (school_id, name, version)',
        'conversation_members USING btree (conversation_id, membership_id)',
        "conversations USING btree (school_id, student_id) WHERE (kind = 'student_school'::conversations_kind)",
        "conversations USING btree (school_id, student_id, instructor_membership_id) WHERE (kind = 'student_instructor'::conversations_kind)",
        'devices USING btree (push_token)',
        'growth_reports USING btree (school_id, month)',
        'guardian_links USING btree (student_id, guardian_user_id) WHERE (revoked_at IS NULL)',
        'invitations USING btree (token_hash)',
        'invoices USING btree (school_id, series, number)',
        'memberships USING btree (school_id, user_id)',
        'notifications USING btree (school_id, user_id, channel, dedupe_key) WHERE (dedupe_key IS NOT NULL)',
        'outbox USING btree (id)',
        'private_notes USING btree (lesson_id, student_id, author_membership_id)',
        'progress_entries USING btree (lesson_id, student_id, syllabus_item_id)',
        'payments USING btree (provider, provider_ref)',
        'plans USING btree (code)',
        'question_packs USING btree (country_code, licence_class, language, version)',
        'questions USING btree (pack_id, external_ref)',
        'theory_answers USING btree (session_id, question_id)',
        "platform_charges USING btree (school_id, student_id) WHERE (kind = 'student_fee'::platform_charges_kind)",
        "platform_charges USING btree (school_id, student_id) WHERE (kind = 'student_fee_reversal'::platform_charges_kind)",
        'platform_statements USING btree (school_id, month)',
        'refresh_tokens USING btree (token_hash)',
        'school_payment_accounts USING btree (school_id, provider)',
        'school_public_profiles USING btree (slug)',
        'school_reviews USING btree (student_id)',
        'student_instructors USING btree (student_id) WHERE (is_primary AND (unassigned_at IS NULL))',
        'student_instructors USING btree (student_id, instructor_membership_id) WHERE (unassigned_at IS NULL)',
        'students USING btree (school_id, user_id) WHERE (user_id IS NOT NULL)',
        'users USING btree (email)',
        'users USING btree (phone)',
        'waiting_list USING btree (school_id, student_id, lesson_type_id) WHERE active',
      ].sort(),
    );
  });

  it('uses the composite primary keys listed in SPEC §6.1', async () => {
    const { rows } = await client.query<{ table_name: string; def: string }>(
      `select conrelid::regclass::text as table_name, pg_get_constraintdef(oid) as def
         from pg_constraint where contype = 'p' and connamespace = 'public'::regnamespace`,
    );
    const pks = Object.fromEntries(rows.map((r) => [r.table_name, r.def]));
    expect(pks).toMatchObject({
      membership_branches: 'PRIMARY KEY (membership_id, branch_id)',
      permission_grants: 'PRIMARY KEY (membership_id, permission)',
      invoice_counters: 'PRIMARY KEY (school_id, series)',
      idempotency_keys: 'PRIMARY KEY (school_id, key)',
      rm_school_metrics_daily: 'PRIMARY KEY (school_id, day)',
      rm_test_attempts_daily: 'PRIMARY KEY (school_id, day, kind)',
      rm_metric_sources: 'PRIMARY KEY (school_id, source_type, source_id)',
      rm_instructor_availability: 'PRIMARY KEY (school_id, instructor_membership_id, version)',
      rm_instructor_time_off: 'PRIMARY KEY (school_id, time_off_id)',
      event_deliveries: 'PRIMARY KEY (subscriber, event_id)',
      school_settings: 'PRIMARY KEY (school_id)',
      platform_admins: 'PRIMARY KEY (user_id)',
      sync_operations: 'PRIMARY KEY (op_id)',
      rm_student_list: 'PRIMARY KEY (student_id)',
      rm_student_lessons: 'PRIMARY KEY (lesson_id)',
      availability_versions: 'PRIMARY KEY (instructor_membership_id)',
      change_feed: 'PRIMARY KEY (seq)',
      outbox: 'PRIMARY KEY (seq)',
      projection_positions: 'PRIMARY KEY (projection, aggregate_type, aggregate_id)',
      lessons: 'PRIMARY KEY (id)',
    });
    expect(Object.keys(pks).sort()).toEqual(ALL_TABLES);
  });

  it('lets refresh_tokens exist without a membership (no school selected yet)', async () => {
    const { rows } = await client.query(
      `select is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = 'refresh_tokens' and column_name = 'membership_id'`,
    );
    expect(rows).toEqual([{ is_nullable: 'YES' }]);
  });

  it('links a rotated refresh token to its successor (0007)', async () => {
    const { rows } = await client.query(
      `select a.attnotnull as not_null, confrelid::regclass::text as references
         from pg_constraint c
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
        where c.conrelid = 'refresh_tokens'::regclass and c.contype = 'f' and a.attname = 'successor_id'`,
    );
    expect(rows).toEqual([{ not_null: false, references: 'refresh_tokens' }]);
  });

  it('is idempotent: bootstrapping and migrating again changes nothing', async () => {
    const env = loadDbToolEnv();
    const before = await client.query(`select count(*) from drizzle.__drizzle_migrations`);
    await bootstrap(env, db.name);
    await migrateDatabase(db.ownerUrl);
    const after = await client.query(`select count(*) from drizzle.__drizzle_migrations`);
    expect(after.rows).toEqual(before.rows);
  });

  it('creates the app roles without superuser powers; only app_system bypasses RLS', async () => {
    const { rows } = await client.query(
      `select rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb from pg_roles
        where rolname in ('driveos_owner', 'app_rw', 'app_system') order by rolname`,
    );
    expect(rows).toEqual([
      {
        rolname: 'app_rw',
        rolcanlogin: true,
        rolsuper: false,
        rolbypassrls: false,
        rolcreaterole: false,
        rolcreatedb: false,
      },
      {
        rolname: 'app_system',
        rolcanlogin: true,
        rolsuper: false,
        rolbypassrls: true,
        rolcreaterole: false,
        rolcreatedb: false,
      },
      {
        rolname: 'driveos_owner',
        rolcanlogin: true,
        rolsuper: false,
        rolbypassrls: false,
        rolcreaterole: false,
        rolcreatedb: false,
      },
    ]);
  });

  it('makes driveos_owner the database owner and lets the app roles connect', async () => {
    const owner = await client.query(
      `select pg_get_userbyid(datdba) as owner from pg_database where datname = $1`,
      [db.name],
    );
    expect(owner.rows).toEqual([{ owner: 'driveos_owner' }]);
    for (const url of [db.appUrl, db.systemUrl]) {
      const c = await connect(url);
      const { rows } = await c.query(`select current_user`);
      await c.end();
      expect(rows[0].current_user).toMatch(/^app_(rw|system)$/);
    }
  });
});
