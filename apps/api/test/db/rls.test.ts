import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Row, RowFactory, type RowSet, rowOf } from './row-factory.js';
import { attempt, inTransaction } from './tenant-tx.js';
import { connect, createScratchDatabase, type ScratchDatabase } from './scratch-database.js';
import {
  GLOBAL_TABLES_WITH_RLS,
  SYSTEM_TABLES_WITH_RLS,
  TABLES_WITHOUT_RLS,
  TENANT_TABLES,
} from './spec-tables.js';

const TENANT_PREDICATE =
  "(school_id = (NULLIF(current_setting('app.school_id'::text, true), ''::text))::uuid)";

function insertSql(client: pg.Client, table: string, row: Row) {
  const columns = Object.keys(row);
  const values = columns.map((c) => {
    const v = row[c];
    return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)
      ? JSON.stringify(v)
      : v;
  });
  return {
    sql: `insert into ${client.escapeIdentifier(table)} (${columns.map((c) => client.escapeIdentifier(c)).join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
    values,
  };
}

const key = (table: string) => (table === 'schools' ? 'id' : 'school_id');

describe('row-level security', () => {
  let db: ScratchDatabase;
  let admin: pg.Client;
  let app: pg.Client;
  let factory: RowFactory;
  let tenantTables: string[];
  const schoolA = randomUUID();
  const schoolB = randomUUID();
  const rowsA: RowSet = new Map();
  const rowsB: RowSet = new Map();

  beforeAll(async () => {
    db = await createScratchDatabase();
    admin = await connect(db.adminUrl);
    app = await connect(db.appUrl);
    factory = await RowFactory.load(admin);
    for (const table of factory.tableNames()) {
      await factory.ensure(admin, table, schoolA, rowsA);
      await factory.ensure(admin, table, schoolB, rowsB);
    }
    const { rows } = await admin.query<{ table_name: string }>(
      `select c.relname as table_name from pg_class c
        where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
          and (c.relname = 'schools' or exists (
                select 1 from pg_attribute a
                 where a.attrelid = c.oid and a.attname = 'school_id' and not a.attisdropped))
        order by 1`,
    );
    tenantTables = rows
      .map((r) => r.table_name)
      .filter(
        (t) =>
          !TABLES_WITHOUT_RLS.has(t) &&
          !GLOBAL_TABLES_WITH_RLS.includes(t) &&
          !SYSTEM_TABLES_WITH_RLS.has(t),
      );
  }, 120_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
    await db?.drop();
  });

  it('finds the SPEC tenant tables by their school_id column', () => {
    expect(tenantTables).toEqual(TENANT_TABLES);
  });

  it('enables and forces RLS with a policy on every table except the listed global/system ones', async () => {
    const { rows } = await admin.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
      policies: number;
    }>(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity,
              (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies
         from pg_class c
        where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
        order by 1`,
    );
    for (const row of rows) {
      const expected = !TABLES_WITHOUT_RLS.has(row.relname);
      expect({
        table: row.relname,
        rls: row.relrowsecurity,
        force: row.relforcerowsecurity,
      }).toEqual({ table: row.relname, rls: expected, force: expected });
      if (expected) expect(row.policies, row.relname).toBeGreaterThan(0);
      else expect(row.policies, row.relname).toBe(0);
    }
  });

  it('gives every tenant table one <table>_tenant policy for all commands with the SPEC predicate', async () => {
    const { rows } = await admin.query<{
      tablename: string;
      policyname: string;
      permissive: string;
      cmd: string;
      qual: string;
      with_check: string;
    }>(
      `select tablename, policyname, permissive, cmd, qual, with_check
         from pg_policies where schemaname = 'public' and tablename = any($1) order by tablename`,
      [tenantTables],
    );
    expect(rows.map((r) => r.tablename)).toEqual(tenantTables);
    for (const row of rows) {
      const predicate =
        row.tablename === 'schools'
          ? TENANT_PREDICATE.replace('(school_id', '(id')
          : TENANT_PREDICATE;
      expect(row).toEqual({
        tablename: row.tablename,
        policyname: `${row.tablename}_tenant`,
        permissive: 'PERMISSIVE',
        cmd: 'ALL',
        qual: predicate,
        with_check: predicate,
      });
    }
  });

  describe('as app_rw with app.school_id = A', () => {
    it('sees only school A rows in every tenant table', async () => {
      await inTransaction(app, { schoolId: schoolA }, async () => {
        for (const table of tenantTables) {
          const { rows } = await app.query<{ a: number; b: number; total: number }>(
            `select count(*) filter (where ${key(table)} = $1)::int as a,
                    count(*) filter (where ${key(table)} = $2)::int as b,
                    count(*)::int as total
               from ${table}`,
            [schoolA, schoolB],
          );
          expect({ table, ...rows[0] }).toEqual({ table, a: 1, b: 0, total: 1 });
        }
      });
    });

    it('rejects inserting a school B row into every tenant table', async () => {
      await inTransaction(app, { schoolId: schoolA }, async () => {
        for (const table of tenantTables) {
          const row = factory.build(table, schoolB, rowsB);
          const { sql, values } = insertSql(app, table, row);
          const result = await attempt(app, sql, values);
          expect({ table, code: result.code, message: result.message }).toEqual({
            table,
            code: '42501',
            message: expect.stringContaining('violates row-level security policy'),
          });
        }
      });
    });

    it('cannot update or delete school B rows, nor move a school A row to school B', async () => {
      await inTransaction(app, { schoolId: schoolA }, async () => {
        for (const table of tenantTables) {
          const k = key(table);
          const update = await attempt(app, `update ${table} set ${k} = ${k} where ${k} = $1`, [
            schoolB,
          ]);
          const remove = await attempt(app, `delete from ${table} where ${k} = $1`, [schoolB]);
          const move = await attempt(app, `update ${table} set ${k} = $2 where ${k} = $1`, [
            schoolA,
            schoolB,
          ]);
          expect({
            table,
            update: update.rowCount,
            remove: remove.rowCount,
            move: move.message,
          }).toEqual({
            table,
            update: 0,
            remove: 0,
            move: expect.stringContaining('violates row-level security policy'),
          });
        }
      });
    });

    it('can insert a full row set for its own school into every tenant table', async () => {
      const schoolC = randomUUID();
      const rowsC: RowSet = new Map([...rowsA].filter(([table]) => !tenantTables.includes(table)));
      await inTransaction(app, { schoolId: schoolC }, async () => {
        for (const table of tenantTables) {
          const row = await factory.ensure(app, table, schoolC, rowsC);
          expect({ table, school: row[key(table)] }).toEqual({ table, school: schoolC });
        }
      });
    });
  });

  describe('as app_rw without app.school_id', () => {
    const rlsTables = () => [...tenantTables, ...GLOBAL_TABLES_WITH_RLS];

    it('owns no table and cannot bypass RLS', async () => {
      const { rows } = await admin.query(
        `select r.rolbypassrls, r.rolsuper,
                pg_has_role('app_rw', 'driveos_owner', 'member') as owner_member,
                (select count(*)::int from pg_tables
                  where schemaname = 'public' and tableowner = 'app_rw') as owned
           from pg_roles r where r.rolname = 'app_rw'`,
      );
      expect(rows).toEqual([
        { rolbypassrls: false, rolsuper: false, owner_member: false, owned: 0 },
      ]);
    });

    it('returns zero rows (no error) from every RLS table although rows exist', async () => {
      for (const table of rlsTables()) {
        const all = await admin.query<{ n: number }>(`select count(*)::int as n from ${table}`);
        expect(all.rows[0]?.n, table).toBeGreaterThan(0);
      }
      await inTransaction(app, {}, async () => {
        for (const table of rlsTables()) {
          const { rows } = await app.query<{ n: number }>(
            `select count(*)::int as n from ${table}`,
          );
          expect({ table, n: rows[0]?.n }).toEqual({ table, n: 0 });
        }
      });
    });

    it('returns zero rows after an earlier transaction set app.school_id locally (empty setting)', async () => {
      await inTransaction(app, { schoolId: schoolA }, async () => undefined);
      const setting = await app.query(`select current_setting('app.school_id', true) as v`);
      expect(setting.rows).toEqual([{ v: '' }]);
      await inTransaction(app, {}, async () => {
        for (const table of rlsTables()) {
          const { rows } = await app.query<{ n: number }>(
            `select count(*)::int as n from ${table}`,
          );
          expect({ table, n: rows[0]?.n }).toEqual({ table, n: 0 });
        }
      });
    });
  });

  describe('global tables with their own policies', () => {
    it('users: sees itself and members of app.school_id only', async () => {
      const outsider = await admin.query<{ id: string }>(
        `insert into users (id, full_name, locale) values ($1, 'Outsider', 'en') returning id`,
        [randomUUID()],
      );
      const outsiderId = outsider.rows[0]?.id as string;
      const memberA = rowOf(rowsA, 'memberships').user_id as string;
      const memberB = rowOf(rowsB, 'memberships').user_id as string;
      await inTransaction(app, { schoolId: schoolA, userId: outsiderId }, async () => {
        const { rows } = await app.query<{ id: string }>(
          `select id from users where id = any($1) order by id`,
          [[outsiderId, memberA, memberB]],
        );
        expect(rows.map((r) => r.id).sort()).toEqual([outsiderId, memberA].sort());
      });
    });

    it('users: may insert a new user, update itself or a member of its school, never delete', async () => {
      const memberA = rowOf(rowsA, 'memberships').user_id as string;
      const memberB = rowOf(rowsB, 'memberships').user_id as string;
      await inTransaction(app, { schoolId: schoolA, userId: memberA }, async () => {
        const insert = await attempt(
          app,
          `insert into users (id, full_name, locale) values ($1, 'New', 'en')`,
          [randomUUID()],
        );
        expect(insert.code).toBeUndefined();
        const own = await attempt(app, `update users set locale = 'de' where id = $1`, [memberA]);
        const other = await attempt(app, `update users set locale = 'de' where id = $1`, [memberB]);
        const remove = await attempt(app, `delete from users where id = $1`, [memberA]);
        expect([own.rowCount, other.rowCount, remove.rowCount]).toEqual([1, 0, 0]);
      });
    });

    it('devices and platform_admins: only rows of app.user_id', async () => {
      const deviceA = rowOf(rowsA, 'devices');
      const deviceB = rowOf(rowsB, 'devices');
      const adminA = rowOf(rowsA, 'platform_admins');
      await inTransaction(app, { userId: deviceA.user_id as string }, async () => {
        const devices = await app.query(`select id from devices`);
        expect(devices.rows).toEqual([{ id: deviceA.id }]);
        const foreign = await attempt(
          app,
          `insert into devices (id, user_id, platform, push_token, locale, last_seen_at)
           values ($1, $2, 'ios', $3, 'en', now())`,
          [randomUUID(), deviceB.user_id, randomUUID()],
        );
        expect(foreign.message).toMatch(/violates row-level security policy/);
      });
      await inTransaction(app, { userId: adminA.user_id as string }, async () => {
        const admins = await app.query(`select user_id from platform_admins`);
        expect(admins.rows).toEqual([{ user_id: adminA.user_id }]);
      });
    });

    it('devices: a school scope without a user reads and prunes the devices of its members only', async () => {
      const deviceA = rowOf(rowsA, 'devices');
      const deviceB = rowOf(rowsB, 'devices');
      await inTransaction(app, { schoolId: schoolA }, async () => {
        const devices = await app.query(`select id from devices`);
        expect(devices.rows).toEqual([{ id: deviceA.id }]);
        const foreign = await attempt(app, `delete from devices where id = $1`, [deviceB.id]);
        expect(foreign.rowCount).toBe(0);
        const pruned = await attempt(app, `delete from devices where id = $1`, [deviceA.id]);
        expect(pruned.rowCount).toBe(1);
      });
      await inTransaction(app, { schoolId: schoolA, userId: randomUUID() }, async () => {
        const removed = await attempt(app, `delete from devices where id = $1`, [deviceA.id]);
        expect(removed.rowCount).toBe(0);
      });
    });

    it('audit_log: reads only app.school_id rows and accepts appends', async () => {
      await admin.query(
        `insert into audit_log (id, school_id, actor_user_id, action, target_type, target_id, at)
         values ($1, null, $2, 'platform.x', 'school', $3, now())`,
        [randomUUID(), rowOf(rowsA, 'users').id, schoolA],
      );
      await inTransaction(app, { schoolId: schoolA }, async () => {
        const { rows } = await app.query(`select id from audit_log`);
        expect(rows).toEqual([{ id: rowOf(rowsA, 'audit_log').id }]);
        const append = await attempt(
          app,
          `insert into audit_log (id, school_id, actor_user_id, action, target_type, target_id, at)
           values ($1, $2, $3, 'student.read', 'student', $4, now())`,
          [randomUUID(), schoolA, rowOf(rowsA, 'users').id, randomUUID()],
        );
        expect(append.code).toBeUndefined();
      });
    });
  });
  describe('payment_webhook_failures (append-only, school may be unknown)', () => {
    const insert = (schoolId: string | null) =>
      attempt(
        app,
        `insert into payment_webhook_failures (id, school_id, provider, reason, failed_at)
         values ($1, $2, 'fake', 'invalid_signature', now())`,
        [randomUUID(), schoolId],
      );

    it('lets app_rw append rows without a school or for its own school only, and never read them', async () => {
      await inTransaction(app, {}, async () => {
        expect((await insert(null)).rowCount).toBe(1);
        expect((await insert(schoolB)).message).toMatch(/row-level security/);
      });
      await inTransaction(app, { schoolId: schoolA }, async () => {
        expect((await insert(schoolA)).rowCount).toBe(1);
        expect((await insert(schoolB)).message).toMatch(/row-level security/);
        expect((await attempt(app, 'select * from payment_webhook_failures')).message).toMatch(
          /permission denied/,
        );
      });
    });
  });
});
