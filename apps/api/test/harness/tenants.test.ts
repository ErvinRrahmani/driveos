import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import {
  authHeaders,
  authHeadersFor,
  createTestTenants,
  type TestTenants,
} from '../support/tenants.js';

describe('createTestTenants', () => {
  let db: ScratchDatabase;
  let tenants: TestTenants;

  beforeAll(async () => {
    db = await createScratchDatabase();
    tenants = await createTestTenants(db);
  }, 60_000);

  afterAll(async () => {
    await tenants?.close();
    await db?.drop();
  });

  it('provisions two distinct schools, each with settings and an active owner membership', async () => {
    const { A, B } = tenants;
    expect(A.schoolId).not.toBe(B.schoolId);
    const rows = await tenants.asSystem((tx) =>
      tx.execute<{ school_id: string; user_id: string; membership_id: string; roles: string[] }>(
        sql`select s.id as school_id, m.user_id, m.id as membership_id, m.roles, m.status, st.school_id as settings
            from schools s
            join school_settings st on st.school_id = s.id
            join memberships m on m.school_id = s.id
            join users u on u.id = m.user_id
            order by s.id`,
      ),
    );
    expect(rows.rows).toEqual(
      [A, B]
        .sort((x, y) => x.schoolId.localeCompare(y.schoolId))
        .map((t) => ({
          school_id: t.schoolId,
          user_id: t.ownerUserId,
          membership_id: t.ownerMembershipId,
          roles: ['owner'],
          status: 'active',
          settings: t.schoolId,
        })),
    );
  });

  it("runs asSchool as app_rw inside the school's tenant transaction", async () => {
    const { A } = tenants;
    const row = await tenants.asSchool(A, async (tx) => {
      const result = await tx.execute<{ who: string; school: string; actor: string }>(
        sql`select current_user as who, current_setting('app.school_id', true) as school,
              current_setting('app.user_id', true) as actor`,
      );
      return result.rows[0];
    });
    expect(row).toEqual({ who: 'app_rw', school: A.schoolId, actor: A.ownerUserId });
  });

  it("keeps A's rows invisible to B and B's rows invisible to A", async () => {
    const { A, B } = tenants;
    const visible = (t: typeof A) =>
      tenants.asSchool(t, async (tx) => {
        const schools = await tx.execute<{ id: string }>(sql`select id from schools`);
        const members = await tx.execute<{ id: string }>(sql`select id from memberships`);
        const settings = await tx.execute<{ school_id: string }>(
          sql`select school_id from school_settings`,
        );
        return {
          schools: schools.rows.map((r) => r.id),
          memberships: members.rows.map((r) => r.id),
          settings: settings.rows.map((r) => r.school_id),
        };
      });
    expect(await visible(A)).toEqual({
      schools: [A.schoolId],
      memberships: [A.ownerMembershipId],
      settings: [A.schoolId],
    });
    expect(await visible(B)).toEqual({
      schools: [B.schoolId],
      memberships: [B.ownerMembershipId],
      settings: [B.schoolId],
    });
  });

  it('runs asSystem as app_system, which sees both schools', async () => {
    const row = await tenants.asSystem(async (tx) => {
      const who = await tx.execute<{ who: string }>(sql`select current_user as who`);
      const count = await tx.execute<{ n: number }>(sql`select count(*)::int as n from schools`);
      return { who: who.rows[0]?.who, n: count.rows[0]?.n };
    });
    expect(row).toEqual({ who: 'app_system', n: 2 });
  });

  it('rolls asSchool back when the callback throws', async () => {
    const { A } = tenants;
    await expect(
      tenants.asSchool(A, async (tx) => {
        await tx.execute(sql`update schools set name = 'Changed' where id = ${A.schoolId}`);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const name = await tenants.asSchool(A, async (tx) => {
      const result = await tx.execute<{ name: string }>(sql`select name from schools`);
      return result.rows[0]?.name;
    });
    expect(name).not.toBe('Changed');
  });

  it('builds the dev auth headers for supertest: the owner membership with the owner role', () => {
    const { A } = tenants;
    expect(authHeaders(A)).toEqual({
      'X-Dev-School': A.schoolId,
      'X-Dev-User': A.ownerUserId,
      'X-Dev-Membership': A.ownerMembershipId,
      'X-Dev-Roles': 'owner',
    });
  });

  it('builds dev auth headers for any roles, membership and user', () => {
    const { A } = tenants;
    expect(
      authHeadersFor(A, { roles: ['office', 'instructor'], membershipId: 'm-1', userId: 'u-1' }),
    ).toEqual({
      'X-Dev-School': A.schoolId,
      'X-Dev-User': 'u-1',
      'X-Dev-Membership': 'm-1',
      'X-Dev-Roles': 'office,instructor',
    });
    expect(authHeadersFor(null, { userId: 'u-2' })).toEqual({
      'X-Dev-School': '',
      'X-Dev-User': 'u-2',
      'X-Dev-Membership': '',
      'X-Dev-Roles': '',
    });
  });

  it('provisions a fresh, independent pair on every call', async () => {
    const more = await createTestTenants(db, { context: tenants.context });
    expect([more.A.schoolId, more.B.schoolId]).not.toContain(tenants.A.schoolId);
    expect([more.A.schoolId, more.B.schoolId]).not.toContain(tenants.B.schoolId);
    const visible = await more.asSchool(more.A, async (tx) => {
      const result = await tx.execute<{ id: string }>(sql`select id from schools`);
      return result.rows.map((r) => r.id);
    });
    expect(visible).toEqual([more.A.schoolId]);
    await more.close();
  });
});
