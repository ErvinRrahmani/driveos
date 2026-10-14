import { randomBytes } from 'node:crypto';
import { MembershipDisabled } from '@driveos/shared';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../../src/kernel/db/columns.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { AnonymizeUserCommand } from '../../src/modules/identity/index.js';
import { refreshTokens } from '../../src/modules/identity/infra/schema.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { expectEvents } from '../support/events.js';
import { executeAs } from '../support/handlers.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import { createTestTenants, type TestTenant, type TestTenants } from '../support/tenants.js';
import { createUser, uniqueEmail, uniquePhone } from './support.js';

describe('AnonymizeUserCommand (student deletion)', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A, B } = tenants);
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  async function student(extraTenant?: TestTenant, roles = ['student']) {
    const user = await createUser(tenants, {
      phone: uniquePhone(),
      email: uniqueEmail(),
      memberships: [
        { tenant: A, roles },
        ...(extraTenant ? [{ tenant: extraTenant, roles: ['student'] }] : []),
      ],
    });
    await tenants.asSystem((tx) =>
      tx.insert(refreshTokens).values({
        userId: user.userId,
        familyId: newId(),
        tokenHash: randomBytes(16).toString('hex'),
        membershipId: user.membershipIds[0] as string,
        client: 'web',
        expiresAt: new Date(Date.now() + 86_400_000),
      }),
    );
    return user;
  }

  const userRow = async (userId: string) =>
    (await system.query(`select full_name, phone, email from users where id = $1`, [userId]))
      .rows[0];
  const membershipStatus = async (membershipId: string) =>
    (await system.query(`select status from memberships where id = $1`, [membershipId])).rows[0]
      ?.status;
  const liveTokens = async (userId: string) =>
    (
      await system.query(
        `select count(*)::int as n from refresh_tokens where user_id = $1 and revoked_at is null`,
        [userId],
      )
    ).rows[0].n;

  it('disables the school membership, revokes sessions and clears the user without other memberships', async () => {
    const user = await student();
    const membershipId = user.membershipIds[0] as string;

    const result = await executeAs(kernel.app, A, new AnonymizeUserCommand(user.userId));

    expect(result).toEqual({ userAnonymized: true });
    expect(await membershipStatus(membershipId)).toBe('disabled');
    expect(await userRow(user.userId)).toEqual({
      full_name: 'Anonymized user',
      phone: null,
      email: null,
    });
    expect(await liveTokens(user.userId)).toBe(0);
    const events = await expectEvents(db, { type: MembershipDisabled, aggregateId: membershipId });
    expect(events).toHaveLength(1);
  });

  it('keeps the user when they are a member of another school', async () => {
    const user = await student(B);

    const result = await executeAs(kernel.app, A, new AnonymizeUserCommand(user.userId));

    expect(result).toEqual({ userAnonymized: false });
    expect(await membershipStatus(user.membershipIds[0] as string)).toBe('disabled');
    expect(await membershipStatus(user.membershipIds[1] as string)).toBe('active');
    expect(await userRow(user.userId)).toMatchObject({ phone: user.phone, email: user.email });
  });

  it('keeps a membership that also holds other roles and the user with it', async () => {
    const user = await student(undefined, ['student', 'parent']);

    const result = await executeAs(kernel.app, A, new AnonymizeUserCommand(user.userId));

    expect(result).toEqual({ userAnonymized: false });
    expect(await membershipStatus(user.membershipIds[0] as string)).toBe('active');
    expect(await userRow(user.userId)).toMatchObject({ phone: user.phone });
  });

  it('is idempotent: a second call changes nothing and appends no event', async () => {
    const user = await student();
    const membershipId = user.membershipIds[0] as string;
    await executeAs(kernel.app, A, new AnonymizeUserCommand(user.userId));

    const again = await executeAs(kernel.app, A, new AnonymizeUserCommand(user.userId));

    expect(again).toEqual({ userAnonymized: true });
    expect(
      await expectEvents(db, { type: MembershipDisabled, aggregateId: membershipId }),
    ).toHaveLength(1);
  });

  it('does nothing for a user who is not a member of the current school', async () => {
    const outsider = await createUser(tenants, {
      phone: uniquePhone(),
      memberships: [{ tenant: B, roles: ['student'] }],
    });

    const result = await executeAs(kernel.app, A, new AnonymizeUserCommand(outsider.userId));

    expect(result).toEqual({ userAnonymized: false });
    expect(await userRow(outsider.userId)).toMatchObject({ phone: outsider.phone });
  });
});
