import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, createScratchDatabase, type ScratchDatabase } from './scratch-database.js';
import { ALL_TABLES, APP_RW_PRIVILEGES } from './spec-tables.js';
import { attempt, inTransaction } from './tenant-tx.js';

const DML = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
const ALL_PRIVILEGES = [...DML, 'TRUNCATE', 'REFERENCES', 'TRIGGER'];

const OUTBOX_INSERT = `insert into outbox (id, school_id, type, version, aggregate_type, aggregate_id,
    aggregate_version, occurred_at, payload)
  values ($1, null, 'SchoolCreated', 1, 'school', $2, 1, now(), '{}')`;

describe('table and sequence grants', () => {
  let db: ScratchDatabase;
  let admin: pg.Client;
  let app: pg.Client;
  let system: pg.Client;

  beforeAll(async () => {
    db = await createScratchDatabase();
    admin = await connect(db.adminUrl);
    app = await connect(db.appUrl);
    system = await connect(db.systemUrl);
  }, 60_000);

  afterAll(async () => {
    await Promise.all([app?.end(), system?.end(), admin?.end()]);
    await db?.drop();
  });

  async function privileges(role: string) {
    const { rows } = await admin.query<{ table: string; privileges: string[] }>(
      `select c.relname as table,
              coalesce(array_agg(p.privilege order by p.privilege)
                         filter (where has_table_privilege($1, c.oid, p.privilege)), '{}') as privileges
         from pg_class c cross join unnest($2::text[]) as p(privilege)
        where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
        group by c.relname order by c.relname`,
      [role, ALL_PRIVILEGES],
    );
    return Object.fromEntries(rows.map((r) => [r.table, r.privileges]));
  }

  it('gives app_rw DML on every table except outbox (INSERT), audit_log (INSERT, SELECT) and the system tables (none)', async () => {
    const expected = Object.fromEntries(
      ALL_TABLES.map((t) => [t, [...(APP_RW_PRIVILEGES[t] ?? DML)].sort()]),
    );
    expect(await privileges('app_rw')).toEqual(expected);
  });

  it('gives app_system DML on every table', async () => {
    const expected = Object.fromEntries(ALL_TABLES.map((t) => [t, [...DML].sort()]));
    expect(await privileges('app_system')).toEqual(expected);
  });

  it('gives both app roles USAGE on the public schema and every sequence', async () => {
    const { rows } = await admin.query(
      `select r.role,
              has_schema_privilege(r.role, 'public', 'USAGE') as schema_usage,
              bool_and(has_sequence_privilege(r.role, s.oid, 'USAGE')) as sequences
         from unnest(array['app_rw', 'app_system']) as r(role)
         cross join pg_class s
        where s.relkind = 'S' and s.relnamespace = 'public'::regnamespace
        group by r.role order by r.role`,
    );
    expect(rows).toEqual([
      { role: 'app_rw', schema_usage: true, sequences: true },
      { role: 'app_system', schema_usage: true, sequences: true },
    ]);
  });

  it('applies the same grants to tables and sequences created by later migrations', async () => {
    const owner = await connect(db.ownerUrl);
    try {
      await owner.query(`create table future_table (id serial primary key)`);
      const { rows } = await admin.query(
        `select r.role,
                has_table_privilege(r.role, 'future_table', 'SELECT, INSERT, UPDATE, DELETE') as dml,
                has_sequence_privilege(r.role, 'future_table_id_seq', 'USAGE') as seq
           from unnest(array['app_rw', 'app_system']) as r(role) order by r.role`,
      );
      expect(rows).toEqual([
        { role: 'app_rw', dml: true, seq: true },
        { role: 'app_system', dml: true, seq: true },
      ]);
    } finally {
      await owner.query(`drop table if exists future_table`);
      await owner.end();
    }
  });

  describe('app_rw on system and append-only tables', () => {
    it('may append to the outbox but not read, update or delete it', async () => {
      await inTransaction(app, {}, async () => {
        const insert = await attempt(app, OUTBOX_INSERT, [randomUUID(), randomUUID()]);
        expect(insert.code).toBeUndefined();
        for (const sql of [
          'select * from outbox',
          'update outbox set published_at = now()',
          'delete from outbox',
        ]) {
          expect((await attempt(app, sql)).code, sql).toBe('42501');
        }
      });
    });

    it('has no access to event_deliveries or dead_letters', async () => {
      await inTransaction(app, {}, async () => {
        for (const sql of [
          'select * from event_deliveries',
          `insert into event_deliveries (subscriber, event_id, delivered_at) values ('s', gen_random_uuid(), now())`,
          'select * from dead_letters',
          `insert into dead_letters (id, subscriber, event_id, error, attempts, failed_at)
             values (gen_random_uuid(), 's', gen_random_uuid(), 'e', 1, now())`,
        ]) {
          expect((await attempt(app, sql)).code, sql).toBe('42501');
        }
      });
    });

    it('cannot update or delete audit_log rows', async () => {
      await inTransaction(app, {}, async () => {
        for (const sql of ['update audit_log set reason = null', 'delete from audit_log']) {
          expect((await attempt(app, sql)).code, sql).toBe('42501');
        }
      });
    });
  });

  describe('app_system', () => {
    it('reads and marks outbox rows and records deliveries and dead letters', async () => {
      const eventId = randomUUID();
      await admin.query(OUTBOX_INSERT, [eventId, randomUUID()]);
      const read = await system.query(`select id from outbox where published_at is null`);
      expect(read.rows).toContainEqual({ id: eventId });
      const mark = await system.query(`update outbox set published_at = now() where id = $1`, [
        eventId,
      ]);
      expect(mark.rowCount).toBe(1);
      await system.query(
        `insert into event_deliveries (subscriber, event_id, delivered_at) values ('s', $1, now())`,
        [eventId],
      );
      await system.query(
        `insert into dead_letters (id, subscriber, event_id, error, attempts, failed_at)
         values ($1, 's', $2, 'boom', 10, now())`,
        [randomUUID(), eventId],
      );
      const delivered = await system.query(`select 1 from event_deliveries where event_id = $1`, [
        eventId,
      ]);
      expect(delivered.rowCount).toBe(1);
    });
  });
});
