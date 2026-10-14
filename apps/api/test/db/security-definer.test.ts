import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSchoolFixture, insertRow, type SchoolFixture } from './fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from './scratch-database.js';
import { inTransaction } from './tenant-tx.js';

const FUNCTIONS = [
  { name: 'auth_find_user_by_contact', args: 'contact text', result: 'uuid' },
  { name: 'auth_login_allowed', args: 'contact text', result: 'boolean' },
  {
    name: 'auth_memberships_for_user',
    args: 'user_id uuid',
    result:
      'TABLE(membership_id uuid, school_id uuid, school_name text, roles text[], status text)',
  },
  {
    name: 'auth_invitation_by_token_hash',
    args: 'hash text',
    result:
      'TABLE(invitation_id uuid, school_id uuid, roles text[], phone text, email text, student_id uuid, expires_at timestamp with time zone, accepted_at timestamp with time zone)',
  },
  {
    name: 'billing_school_for_payment',
    args: 'provider text, provider_ref text',
    result: 'uuid',
  },
  { name: 'auth_release_push_token', args: 'push_token text', result: 'void' },
  {
    name: 'platform_list_statements',
    args: 'filter_status text, filter_school_id uuid, filter_month date, after_id uuid, max_rows integer',
    result:
      'TABLE(statement_id uuid, school_id uuid, school_name text, month date, total_minor bigint, currency text, status text, issued_at timestamp with time zone, paid_at timestamp with time zone, paid_method text, paid_reference text, marked_paid_by_user_id uuid)',
  },
  { name: 'platform_statement_school', args: 'statement_id uuid', result: 'uuid' },
  {
    name: 'billing_count_webhook_failures',
    args: 'since timestamp with time zone',
    result: 'bigint',
  },
  {
    name: 'auth_devices_for_school_members',
    args: 'user_ids uuid[]',
    result: 'TABLE(device_id uuid, user_id uuid, push_token text, platform text, locale text)',
  },
  {
    name: 'auth_prune_device',
    args: 'device_id uuid, user_id uuid, seen_before timestamp with time zone',
    result: 'void',
  },
  { name: 'school_id_for_public_slug', args: 'slug text', result: 'uuid' },
];

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');

async function securityDefinerFunctionsInMigrations(): Promise<string[]> {
  const names = new Set<string>();
  for (const file of (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql'))) {
    const text = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const definitions = text.split(/(?=CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION)/i);
    for (const definition of definitions) {
      const match = /^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?(\w+)"?/i.exec(
        definition,
      );
      const body = definition.split(/--> statement-breakpoint/)[0] ?? '';
      if (match?.[1] && /SECURITY\s+DEFINER/i.test(body)) names.add(match[1]);
    }
  }
  return [...names].sort();
}

const ALICE_PHONE = '+447700900001';
const PAT_PHONE = '+447700900003';
const INVITEE_PHONE = '+447700900010';
const EXPIRED_PHONE = '+447700900011';
const ACCEPTED_PHONE = '+447700900012';

describe('SECURITY DEFINER functions', () => {
  let db: ScratchDatabase;
  let admin: pg.Client;
  let app: pg.Client;
  let a: SchoolFixture;
  let b: SchoolFixture;
  let c: SchoolFixture;
  const alice = randomUUID();
  const dora = randomUUID();
  const pat = randomUUID();
  let aliceInA: string;
  let aliceInB: string;
  let invitationId: string;
  let issuedInA: string;
  let paidInB: string;
  const expiresAt = new Date(Date.now() + 86_400_000);

  async function user(id: string, contact: { phone?: string; email?: string }) {
    await admin.query(
      `insert into users (id, full_name, phone, email, locale) values ($1, 'U', $2, $3, 'en')`,
      [id, contact.phone ?? null, contact.email ?? null],
    );
  }

  async function membership(school: SchoolFixture, userId: string, status: string) {
    return insertRow(admin, 'memberships', {
      school_id: school.schoolId,
      user_id: userId,
      roles: ['student'],
      status,
    });
  }

  async function invitation(school: SchoolFixture, row: Record<string, unknown>) {
    return insertRow(admin, 'invitations', {
      school_id: school.schoolId,
      roles: ['student'],
      invited_by: school.ownerUserId,
      token_hash: randomUUID(),
      expires_at: expiresAt,
      ...row,
    });
  }

  beforeAll(async () => {
    db = await createScratchDatabase();
    admin = await connect(db.adminUrl);
    app = await connect(db.appUrl);
    a = await createSchoolFixture(admin);
    b = await createSchoolFixture(admin);
    c = await createSchoolFixture(admin);
    await admin.query(`update schools set name = 'School A' where id = $1`, [a.schoolId]);
    await admin.query(`update schools set name = 'School B' where id = $1`, [b.schoolId]);
    await user(alice, { phone: ALICE_PHONE, email: 'Alice@Example.com' });
    await user(dora, { email: 'dora@example.com' });
    await user(pat, { phone: PAT_PHONE });
    aliceInA = await membership(a, alice, 'active');
    aliceInB = await membership(b, alice, 'pending_consent');
    await membership(a, dora, 'disabled');
    await admin.query(`insert into platform_admins (user_id) values ($1)`, [pat]);
    invitationId = await invitation(b, {
      phone: INVITEE_PHONE,
      email: 'invitee@example.com',
      student_id: b.studentIds[0],
      token_hash: 'hash-pending',
    });
    await invitation(b, { phone: EXPIRED_PHONE, expires_at: new Date(Date.now() - 1000) });
    await invitation(b, { phone: ACCEPTED_PHONE, accepted_at: new Date() });
    await insertRow(admin, 'payments', {
      school_id: b.schoolId,
      student_id: b.studentIds[0],
      method: 'in_app',
      provider: 'fake',
      provider_ref: 'pi_123',
      amount_minor: 5000,
      currency: 'GBP',
      status: 'succeeded',
    });
    issuedInA = await insertRow(admin, 'platform_statements', {
      school_id: a.schoolId,
      month: '2026-09-01',
      total_minor: 4900,
      currency: 'EUR',
      status: 'issued',
      issued_at: new Date('2026-10-01T01:00:00Z'),
    });
    paidInB = await insertRow(admin, 'platform_statements', {
      school_id: b.schoolId,
      month: '2026-09-01',
      total_minor: 300,
      currency: 'EUR',
      status: 'paid',
      issued_at: new Date('2026-10-01T02:00:00Z'),
      paid_at: new Date('2026-10-05T10:00:00Z'),
      paid_method: 'bank_transfer',
      paid_reference: 'REF-1',
      marked_paid_by_user_id: pat,
    });
  }, 60_000);

  afterAll(async () => {
    await app?.end();
    await admin?.end();
    await db?.drop();
  });

  const call = <T extends pg.QueryResultRow>(sql: string, params: unknown[]) =>
    inTransaction(app, { schoolId: c.schoolId, userId: randomUUID() }, async () => {
      const { rows } = await app.query<T>(sql, params);
      return rows;
    });

  const scalar = async (fn: string, ...params: unknown[]) => {
    const placeholders = params.map((_, i) => `$${i + 1}`).join(', ');
    const rows = await call<{ v: unknown }>(`select ${fn}(${placeholders}) as v`, params);
    return rows[0]?.v;
  };

  describe('catalog', () => {
    it('owns the functions by a no-login role that bypasses RLS', async () => {
      const { rows } = await admin.query(
        `select rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
           from pg_roles where rolname = 'driveos_definer'`,
      );
      expect(rows).toEqual([
        {
          rolcanlogin: false,
          rolsuper: false,
          rolbypassrls: true,
          rolcreaterole: false,
          rolcreatedb: false,
        },
      ]);
    });

    it('lists every SECURITY DEFINER function of the migrations in FUNCTIONS', async () => {
      const tested = FUNCTIONS.map((fn) => fn.name).sort();

      expect(await securityDefinerFunctionsInMigrations()).toEqual(tested);
      const { rows } = await admin.query<{ proname: string }>(
        `select p.proname from pg_proc p
          where p.pronamespace = 'public'::regnamespace and p.prosecdef
          order by 1`,
      );
      expect(rows.map((row) => row.proname)).toEqual(tested);
    });

    it.each(FUNCTIONS)('$name returns only its listed columns', async (fn) => {
      const { rows } = await admin.query(
        `select pg_get_function_identity_arguments(p.oid) as args,
                pg_get_function_result(p.oid) as result,
                p.prosecdef as security_definer,
                pg_get_userbyid(p.proowner) as owner,
                p.proconfig as config
           from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`,
        [fn.name],
      );
      expect(rows).toEqual([
        {
          args: fn.args,
          result: fn.result,
          security_definer: true,
          owner: 'driveos_definer',
          config: ['search_path=public, pg_temp'],
        },
      ]);
    });

    it.each(FUNCTIONS)('$name is executable by app_rw only, not PUBLIC', async (fn) => {
      const { rows } = await admin.query<{ grantee: string }>(
        `select coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC') as grantee
           from pg_proc p, aclexplode(p.proacl) a
          where p.pronamespace = 'public'::regnamespace and p.proname = $1
            and a.privilege_type = 'EXECUTE'
          order by 1`,
        [fn.name],
      );
      expect(rows.map((r) => r.grantee)).toEqual(['app_rw', 'driveos_definer']);
      const system = await connect(db.systemUrl);
      try {
        const args = fn.args.split(', ').map(() => 'null');
        await expect(system.query(`select ${fn.name}(${args.join(', ')})`)).rejects.toMatchObject({
          code: '42501',
        });
      } finally {
        await system.end();
      }
    });
  });

  describe('auth_find_user_by_contact', () => {
    it('finds by exact phone', async () => {
      expect(await scalar('auth_find_user_by_contact', ALICE_PHONE)).toBe(alice);
    });

    it('finds by email, case-insensitively', async () => {
      expect(await scalar('auth_find_user_by_contact', 'alice@example.com')).toBe(alice);
      expect(await scalar('auth_find_user_by_contact', 'ALICE@EXAMPLE.COM')).toBe(alice);
    });

    it('returns null for an unknown contact', async () => {
      expect(await scalar('auth_find_user_by_contact', '+10000000000')).toBeNull();
    });
  });

  describe('auth_login_allowed', () => {
    it.each([
      ['a user with an active membership (phone)', ALICE_PHONE, true],
      ['a user with an active membership (email, any case)', 'ALICE@example.com', true],
      ['a platform admin without memberships', PAT_PHONE, true],
      ['a pending invitation (phone)', INVITEE_PHONE, true],
      ['a pending invitation (email, any case)', 'Invitee@Example.com', true],
      ['a user whose only membership is disabled', 'dora@example.com', false],
      ['an expired invitation', EXPIRED_PHONE, false],
      ['an accepted invitation', ACCEPTED_PHONE, false],
      ['an unknown contact', '+10000000000', false],
    ])('%s → %s', async (_label, contact, allowed) => {
      expect(await scalar('auth_login_allowed', contact)).toBe(allowed);
    });
  });

  describe('auth_memberships_for_user', () => {
    it('lists memberships across schools from another school’s transaction', async () => {
      const rows = await call(`select * from auth_memberships_for_user($1)`, [alice]);
      expect(rows.map((r) => Object.keys(r))).toEqual([
        ['membership_id', 'school_id', 'school_name', 'roles', 'status'],
        ['membership_id', 'school_id', 'school_name', 'roles', 'status'],
      ]);
      expect(rows).toEqual(
        expect.arrayContaining([
          {
            membership_id: aliceInA,
            school_id: a.schoolId,
            school_name: 'School A',
            roles: ['student'],
            status: 'active',
          },
          {
            membership_id: aliceInB,
            school_id: b.schoolId,
            school_name: 'School B',
            roles: ['student'],
            status: 'pending_consent',
          },
        ]),
      );
    });

    it('returns no rows for an unknown user', async () => {
      expect(await call(`select * from auth_memberships_for_user($1)`, [randomUUID()])).toEqual([]);
    });

    it("never returns another user's memberships", async () => {
      const rows = await call<{ membership_id: string }>(
        `select * from auth_memberships_for_user($1)`,
        [pat],
      );
      expect(rows).toEqual([]);
      const dorasRows = await call<{ membership_id: string }>(
        `select membership_id from auth_memberships_for_user($1)`,
        [dora],
      );
      expect(dorasRows.map((row) => row.membership_id)).not.toContain(aliceInA);
    });
  });

  describe('auth_invitation_by_token_hash', () => {
    it('returns the invitation and its school', async () => {
      const rows = await call(`select * from auth_invitation_by_token_hash($1)`, ['hash-pending']);
      expect(rows).toEqual([
        {
          invitation_id: invitationId,
          school_id: b.schoolId,
          roles: ['student'],
          phone: INVITEE_PHONE,
          email: 'invitee@example.com',
          student_id: b.studentIds[0],
          expires_at: expiresAt,
          accepted_at: null,
        },
      ]);
    });

    it('returns only the invitation of the presented hash, never by id or contact', async () => {
      expect(await call(`select * from auth_invitation_by_token_hash($1)`, [invitationId])).toEqual(
        [],
      );
      expect(
        await call(`select * from auth_invitation_by_token_hash($1)`, [INVITEE_PHONE]),
      ).toEqual([]);
    });

    it('returns no rows for an unknown hash', async () => {
      expect(await call(`select * from auth_invitation_by_token_hash($1)`, ['nope'])).toEqual([]);
    });
  });

  describe('billing_school_for_payment', () => {
    it('returns the school of a provider payment', async () => {
      expect(await scalar('billing_school_for_payment', 'fake', 'pi_123')).toBe(b.schoolId);
    });

    it('returns null for an unknown payment', async () => {
      expect(await scalar('billing_school_for_payment', 'fake', 'pi_999')).toBeNull();
    });

    it("returns null for another provider's reference", async () => {
      expect(await scalar('billing_school_for_payment', 'stripe', 'pi_123')).toBeNull();
    });
  });

  describe('auth_release_push_token', () => {
    async function device(userId: string, pushToken: string) {
      return insertRow(admin, 'devices', {
        user_id: userId,
        platform: 'ios',
        push_token: pushToken,
        locale: 'en',
        last_seen_at: new Date(),
      });
    }

    const devicesWith = async (pushToken: string) =>
      (
        await admin.query<{ user_id: string }>(
          `select user_id from devices where push_token = $1`,
          [pushToken],
        )
      ).rows.map((row) => row.user_id);

    async function release(userId: string | null, pushToken: string) {
      await app.query('begin');
      try {
        if (userId) await app.query(`select set_config('app.user_id', $1, true)`, [userId]);
        const { rows } = await app.query(`select auth_release_push_token($1) as v`, [pushToken]);
        await app.query('commit');
        return rows;
      } catch (error) {
        await app.query('rollback');
        throw error;
      }
    }

    it("deletes another user's device holding the push token, returning nothing", async () => {
      await device(dora, 'push-moved');

      expect(await release(alice, 'push-moved')).toEqual([{ v: null }]);
      expect(await devicesWith('push-moved')).toEqual([]);
    });

    it("keeps the caller's own device and other push tokens", async () => {
      await device(alice, 'push-own');
      await device(dora, 'push-other');

      await release(alice, 'push-own');

      expect(await devicesWith('push-own')).toEqual([alice]);
      expect(await devicesWith('push-other')).toEqual([dora]);
    });

    it('does nothing without app.user_id', async () => {
      await device(dora, 'push-anonymous');

      await release(null, 'push-anonymous');

      expect(await devicesWith('push-anonymous')).toEqual([dora]);
    });
  });

  describe('platform statement functions', () => {
    const asUser = <T extends pg.QueryResultRow>(userId: string, sql: string, params: unknown[]) =>
      inTransaction(app, { userId }, async () => (await app.query<T>(sql, params)).rows);

    const list = (userId: string, ...params: unknown[]) =>
      asUser(userId, 'select * from platform_list_statements($1, $2, $3, $4, $5)', params);

    it('lists the statements of every school, newest first, for a platform admin', async () => {
      const rows = await list(pat, null, null, null, null, 50);
      expect(rows.map((row) => row.statement_id)).toEqual([paidInB, issuedInA]);
      expect(Object.keys(rows[0] ?? {})).toEqual([
        'statement_id',
        'school_id',
        'school_name',
        'month',
        'total_minor',
        'currency',
        'status',
        'issued_at',
        'paid_at',
        'paid_method',
        'paid_reference',
        'marked_paid_by_user_id',
      ]);
      expect(rows[0]).toMatchObject({
        school_id: b.schoolId,
        school_name: 'School B',
        total_minor: '300',
        status: 'paid',
        paid_method: 'bank_transfer',
        paid_reference: 'REF-1',
        marked_paid_by_user_id: pat,
      });
    });

    it('filters by status, school and month and pages after an id', async () => {
      const ids = async (...params: unknown[]) =>
        (await list(pat, ...params)).map((row) => row.statement_id);
      expect(await ids('issued', null, null, null, 50)).toEqual([issuedInA]);
      expect(await ids(null, b.schoolId, null, null, 50)).toEqual([paidInB]);
      expect(await ids(null, null, '2026-08-01', null, 50)).toEqual([]);
      expect(await ids(null, null, '2026-09-01', null, 1)).toEqual([paidInB]);
      expect(await ids(null, null, null, paidInB, 50)).toEqual([issuedInA]);
    });

    it('returns nothing to a caller who is not a platform admin', async () => {
      expect(await list(alice, null, null, null, null, 50)).toEqual([]);
      const rows = await asUser(alice, 'select platform_statement_school($1) as v', [issuedInA]);
      expect(rows[0]?.v).toBeNull();
    });

    it('resolves the school of a statement for a platform admin', async () => {
      const school = async (id: string) =>
        (await asUser(pat, 'select platform_statement_school($1) as v', [id]))[0]?.v;
      expect(await school(issuedInA)).toBe(a.schoolId);
      expect(await school(randomUUID())).toBeNull();
    });
  });

  describe('auth_devices_for_school_members', () => {
    const listed = (schoolId: string | undefined, userIds: string[]) =>
      inTransaction(app, schoolId ? { schoolId } : {}, async () => {
        const { rows } = await app.query(
          `select * from auth_devices_for_school_members($1::uuid[])`,
          [userIds],
        );
        return rows;
      });

    async function device(userId: string, pushToken: string, lastSeenAt: Date) {
      return insertRow(admin, 'devices', {
        user_id: userId,
        platform: 'ios',
        push_token: pushToken,
        locale: 'en',
        last_seen_at: lastSeenAt,
      });
    }

    // Fresh users: other cases in this file add devices to alice and dora.
    const inBoth = randomUUID();
    const disabledInA = randomUUID();
    const nowhere = randomUUID();
    let inBothOld: string;
    let inBothNew: string;
    let disabledDevice: string;
    let nowhereDevice: string;

    beforeAll(async () => {
      await user(inBoth, { email: 'list-both@example.com' });
      await user(disabledInA, { email: 'list-disabled@example.com' });
      await user(nowhere, { email: 'list-nowhere@example.com' });
      await membership(a, inBoth, 'active');
      await membership(b, inBoth, 'pending_consent');
      await membership(a, disabledInA, 'disabled');
      inBothOld = await device(inBoth, 'list-both-old', new Date('2026-01-01T00:00:00Z'));
      inBothNew = await device(inBoth, 'list-both-new', new Date('2026-02-01T00:00:00Z'));
      disabledDevice = await device(disabledInA, 'list-disabled', new Date('2026-01-01T00:00:00Z'));
      nowhereDevice = await device(nowhere, 'list-nowhere', new Date('2026-01-01T00:00:00Z'));
    });

    it("lists the requested users' devices when they are members of app.school_id, oldest first per user", async () => {
      const rows = await listed(a.schoolId, [inBoth, disabledInA, nowhere]);
      expect(rows.map((row) => Object.keys(row))).toEqual(
        rows.map(() => ['device_id', 'user_id', 'push_token', 'platform', 'locale']),
      );
      expect(rows.map((row) => row.device_id).sort()).toEqual(
        [inBothOld, inBothNew, disabledDevice].sort(),
      );
      expect(rows.filter((row) => row.user_id === inBoth)).toEqual([
        {
          device_id: inBothOld,
          user_id: inBoth,
          push_token: 'list-both-old',
          platform: 'ios',
          locale: 'en',
        },
        {
          device_id: inBothNew,
          user_id: inBoth,
          push_token: 'list-both-new',
          platform: 'ios',
          locale: 'en',
        },
      ]);
    });

    it('returns only the devices of users that were asked for', async () => {
      const rows = await listed(a.schoolId, [disabledInA]);
      expect(rows.map((row) => row.device_id)).toEqual([disabledDevice]);
    });

    it('skips users without a membership in app.school_id', async () => {
      const rows = await listed(b.schoolId, [inBoth, disabledInA, nowhere]);
      expect(rows.map((row) => row.device_id)).toEqual([inBothOld, inBothNew]);
      expect(rows.map((row) => row.device_id)).not.toContain(nowhereDevice);
    });

    it('returns nothing without app.school_id', async () => {
      expect(await listed(undefined, [inBoth, disabledInA, nowhere])).toEqual([]);
    });
  });

  describe('auth_prune_device', () => {
    const seenAt = new Date('2026-03-01T12:00:00Z');

    async function device(userId: string, pushToken: string) {
      return insertRow(admin, 'devices', {
        user_id: userId,
        platform: 'android',
        push_token: pushToken,
        locale: 'en',
        last_seen_at: seenAt,
      });
    }

    const exists = async (id: string) =>
      (await admin.query(`select 1 from devices where id = $1`, [id])).rowCount === 1;

    async function prune(
      tenant: { schoolId?: string; userId?: string },
      deviceId: string,
      userId: string,
      seenBefore: Date,
    ) {
      await app.query('begin');
      try {
        if (tenant.schoolId) {
          await app.query(`select set_config('app.school_id', $1, true)`, [tenant.schoolId]);
        }
        if (tenant.userId) {
          await app.query(`select set_config('app.user_id', $1, true)`, [tenant.userId]);
        }
        const { rows } = await app.query(
          `select auth_prune_device($1::uuid, $2::uuid, $3::timestamptz) as v`,
          [deviceId, userId, seenBefore],
        );
        await app.query('commit');
        return rows;
      } catch (error) {
        await app.query('rollback');
        throw error;
      }
    }

    it("deletes a member's device last seen at or before seen_before, returning nothing", async () => {
      const id = await device(alice, 'prune-dead');

      expect(await prune({ schoolId: a.schoolId }, id, alice, seenAt)).toEqual([{ v: null }]);
      expect(await exists(id)).toBe(false);
    });

    it('keeps a device that re-registered after seen_before', async () => {
      const id = await device(alice, 'prune-back');

      await prune({ schoolId: a.schoolId }, id, alice, new Date(seenAt.getTime() - 1000));

      expect(await exists(id)).toBe(true);
    });

    it('keeps the device when the user id does not match', async () => {
      const id = await device(alice, 'prune-wrong-user');

      await prune({ schoolId: a.schoolId }, id, dora, seenAt);

      expect(await exists(id)).toBe(true);
    });

    it('keeps the device of a user who is not a member of app.school_id', async () => {
      const id = await device(pat, 'prune-not-member');

      await prune({ schoolId: a.schoolId }, id, pat, seenAt);

      expect(await exists(id)).toBe(true);
    });

    it('does nothing in a request scope (app.user_id set) or without a school', async () => {
      const id = await device(alice, 'prune-request');

      await prune({ schoolId: a.schoolId, userId: alice }, id, alice, seenAt);
      await prune({}, id, alice, seenAt);

      expect(await exists(id)).toBe(true);
    });
  });

  describe('billing_count_webhook_failures', () => {
    const count = (tenant: { schoolId?: string; userId?: string }, since: Date) =>
      inTransaction(app, tenant, async () => {
        const { rows } = await app.query<{ n: string }>(
          `select billing_count_webhook_failures($1::timestamptz) as n`,
          [since],
        );
        return Number(rows[0]?.n);
      });

    beforeAll(async () => {
      const failure = (schoolId: string | null, failedAt: Date) =>
        insertRow(admin, 'payment_webhook_failures', {
          school_id: schoolId,
          provider: 'fake',
          provider_ref: null,
          reason: 'invalid_signature',
          failed_at: failedAt,
        });
      await failure(null, new Date('2026-05-01T10:00:00Z'));
      await failure(a.schoolId, new Date('2026-05-01T10:30:00Z'));
      await failure(b.schoolId, new Date('2026-05-01T08:00:00Z'));
    });

    it('counts failures of every school after `since` from a school-less scope', async () => {
      expect(await count({}, new Date('2026-05-01T09:00:00Z'))).toBe(2);
      expect(await count({}, new Date('2026-05-01T07:00:00Z'))).toBe(3);
      expect(await count({ userId: pat }, new Date('2026-05-01T10:15:00Z'))).toBe(1);
    });

    it('returns zero inside a school scope', async () => {
      expect(await count({ schoolId: a.schoolId }, new Date('2026-05-01T07:00:00Z'))).toBe(0);
    });
  });

  describe('school_id_for_public_slug', () => {
    let suspended: SchoolFixture;

    const resolve = (slug: string, tenant: { schoolId?: string } = {}) =>
      inTransaction(app, tenant, async () => {
        const { rows } = await app.query<{ v: string | null }>(
          `select school_id_for_public_slug($1) as v`,
          [slug],
        );
        return rows[0]?.v ?? null;
      });

    const profile = (school: SchoolFixture, slug: string, published: boolean) =>
      admin.query(
        `insert into school_public_profiles (school_id, slug, published) values ($1, $2, $3)`,
        [school.schoolId, slug, published],
      );

    beforeAll(async () => {
      suspended = await createSchoolFixture(admin);
      await admin.query(`update schools set status = 'suspended' where id = $1`, [
        suspended.schoolId,
      ]);
      await profile(a, 'school-a-page', true);
      await profile(b, 'school-b-draft', false);
      await profile(suspended, 'suspended-page', true);
    });

    it('returns the school of a published profile of an active school, from a school-less scope', async () => {
      expect(await resolve('school-a-page')).toBe(a.schoolId);
      expect(await resolve('school-a-page', { schoolId: b.schoolId })).toBe(a.schoolId);
    });

    it('returns null for an unpublished profile', async () => {
      expect(await resolve('school-b-draft')).toBeNull();
    });

    it('returns null for a suspended school', async () => {
      expect(await resolve('suspended-page')).toBeNull();
    });

    it('returns null for an unknown slug', async () => {
      expect(await resolve('no-such-school')).toBeNull();
    });
  });
});
