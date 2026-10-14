import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { MembershipDirectory } from '../../src/modules/identity/index.js';
import { membershipBranches, permissionGrants } from '../../src/modules/identity/infra/schema.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import { createTestTenants, type TestTenant, type TestTenants } from '../support/tenants.js';
import { createBranch, createUser, type TestUser, uniqueEmail, uniquePhone } from './support.js';

describe('identity.MembershipDirectory (same-transaction service)', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let directory: MembershipDirectory;
  let instructor: TestUser;
  let office: TestUser;
  let student: TestUser;
  let disabled: TestUser;
  let foreign: TestUser;
  let branchId: string;

  const inA = <T>(fn: () => Promise<T>) => tenants.asSchool(A, () => fn());
  const idOf = (user: TestUser) => user.membershipIds[0] as string;

  beforeAll(async () => {
    db = await createScratchDatabase();
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    A = tenants.A;
    directory = kernel.app.get(MembershipDirectory);
    instructor = await createUser(tenants, {
      phone: uniquePhone(),
      email: uniqueEmail(),
      memberships: [{ tenant: A, roles: ['owner', 'instructor'] }],
    });
    office = await createUser(tenants, { memberships: [{ tenant: A, roles: ['office'] }] });
    student = await createUser(tenants, {
      memberships: [{ tenant: A, roles: ['student'], status: 'pending_consent' }],
    });
    disabled = await createUser(tenants, {
      memberships: [{ tenant: A, roles: ['instructor'], status: 'disabled' }],
    });
    foreign = await createUser(tenants, {
      memberships: [{ tenant: tenants.B, roles: ['instructor'] }],
    });
    branchId = await createBranch(tenants, A);
    await inA(async () => {
      const tx = kernel.app.get(TenantContext).tx;
      await tx
        .insert(membershipBranches)
        .values({ schoolId: A.schoolId, membershipId: idOf(office), branchId });
      await tx
        .insert(permissionGrants)
        .values({ schoolId: A.schoolId, membershipId: idOf(office), permission: 'prices.manage' });
    });
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  it('gets one membership with its branches and grants', async () => {
    expect(await inA(() => directory.getMembership(idOf(office)))).toEqual({
      id: idOf(office),
      userId: office.userId,
      roles: ['office'],
      status: 'active',
      version: 1,
      branchIds: [branchId],
      grants: ['prices.manage'],
    });
  });

  it("never sees another school's membership", async () => {
    expect(await inA(() => directory.getMembership(idOf(foreign)))).toBeNull();
    expect(await inA(() => directory.userIdOf(idOf(foreign)))).toBeNull();
    expect(await inA(() => directory.hasRole(idOf(foreign), 'instructor'))).toBe(false);
    expect(await inA(() => directory.findByUser(foreign.userId))).toBeNull();
  });

  it('lists memberships by role, in every status', async () => {
    const ids = (await inA(() => directory.listByRole('instructor'))).map((m) => m.id);
    expect(ids.sort()).toEqual([idOf(instructor), idOf(disabled)].sort());
  });

  it('finds the membership of a user in the current school', async () => {
    expect(await inA(() => directory.findByUser(student.userId))).toMatchObject({
      id: idOf(student),
      status: 'pending_consent',
    });
  });

  it('maps a membership to its user', async () => {
    expect(await inA(() => directory.userIdOf(idOf(student)))).toBe(student.userId);
  });

  it('answers hasRole for active memberships only', async () => {
    expect(await inA(() => directory.hasRole(idOf(instructor), 'instructor'))).toBe(true);
    expect(await inA(() => directory.hasRole(idOf(instructor), 'owner'))).toBe(true);
    expect(await inA(() => directory.hasRole(idOf(instructor), 'office'))).toBe(false);
    expect(await inA(() => directory.hasRole(idOf(disabled), 'instructor'))).toBe(false);
  });

  it('lists staff (owner, office, instructor) with name and contacts', async () => {
    const staff = await inA(() => directory.listStaff());
    const byId = new Map(staff.map((s) => [s.membershipId, s]));
    expect([...byId.keys()].sort()).toEqual(
      [A.ownerMembershipId, idOf(instructor), idOf(office), idOf(disabled)].sort(),
    );
    expect(byId.get(idOf(instructor))).toEqual({
      membershipId: idOf(instructor),
      userId: instructor.userId,
      fullName: expect.any(String),
      phone: instructor.phone,
      email: instructor.email,
      roles: ['owner', 'instructor'],
      status: 'active',
    });
  });

  it('gives the contacts of users who are members of the current school only', async () => {
    const contacts = await inA(() =>
      directory.contactsOf([instructor.userId, student.userId, foreign.userId]),
    );
    expect(contacts.sort((a, b) => a.userId.localeCompare(b.userId))).toEqual(
      [
        {
          userId: instructor.userId,
          fullName: expect.any(String),
          phone: instructor.phone,
          email: instructor.email,
        },
        { userId: student.userId, fullName: expect.any(String), phone: null, email: null },
      ].sort((a, b) => a.userId.localeCompare(b.userId)),
    );
    expect(await inA(() => directory.contactsOf([]))).toEqual([]);
  });
});
