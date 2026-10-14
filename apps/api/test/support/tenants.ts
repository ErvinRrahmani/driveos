import { newId } from '../../src/kernel/db/columns.js';
import { DatabaseService } from '../../src/kernel/db/database.service.js';
import { TenantContext, type Transaction } from '../../src/kernel/tenant/tenant-context.js';
import { memberships, users } from '../../src/modules/identity/infra/schema.js';
import { schoolSettings, schools } from '../../src/modules/school/infra/schema.js';
import type { ScratchDatabase } from '../db/scratch-database.js';

export type TenantLabel = 'A' | 'B';

export interface TestTenant {
  label: TenantLabel;
  schoolId: string;
  ownerUserId: string;
  ownerMembershipId: string;
}

export interface TestTenants {
  A: TestTenant;
  B: TestTenant;
  context: TenantContext;
  asSchool<T>(tenant: TestTenant, fn: (tx: Transaction) => Promise<T>): Promise<T>;
  asSystem<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface CreateTestTenantsOptions {
  context?: TenantContext;
}

const SCHOOL_PROFILE = {
  A: { name: 'School A', timeZone: 'Europe/Berlin', countryCode: 'DE' },
  B: { name: 'School B', timeZone: 'Europe/Lisbon', countryCode: 'PT' },
} as const;

export interface OwnedTenantContext {
  context: TenantContext;
  close(): Promise<void>;
}

export function tenantContextFor(
  db: Pick<ScratchDatabase, 'appUrl' | 'systemUrl'>,
): OwnedTenantContext {
  const database = new DatabaseService({
    DATABASE_URL: db.appUrl,
    DATABASE_SYSTEM_URL: db.systemUrl,
  });
  return { context: new TenantContext(database), close: () => database.close() };
}

export function asSchool<T>(
  context: TenantContext,
  tenant: TestTenant,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return context.runInTenant({ schoolId: tenant.schoolId, userId: tenant.ownerUserId }, () =>
    fn(context.tx),
  );
}

export function asSystem<T>(
  context: TenantContext,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return context.runAsSystem(fn);
}

async function provision(context: TenantContext, label: TenantLabel): Promise<TestTenant> {
  const tenant: TestTenant = {
    label,
    schoolId: newId(),
    ownerUserId: newId(),
    ownerMembershipId: newId(),
  };
  const profile = SCHOOL_PROFILE[label];
  await context.runAsSystem((tx) =>
    tx.insert(users).values({
      id: tenant.ownerUserId,
      fullName: `Owner ${label} ${tenant.ownerUserId.slice(-6)}`,
      locale: 'en',
    }),
  );
  await asSchool(context, tenant, async (tx) => {
    await tx.insert(schools).values({
      id: tenant.schoolId,
      name: profile.name,
      legalName: `${profile.name} Ltd`,
      address: `1 ${label} Street`,
      countryCode: profile.countryCode,
      timeZone: profile.timeZone,
      currency: 'EUR',
      locale: 'en',
      status: 'active',
    });
    await tx.insert(schoolSettings).values({ schoolId: tenant.schoolId });
    await tx.insert(memberships).values({
      id: tenant.ownerMembershipId,
      schoolId: tenant.schoolId,
      userId: tenant.ownerUserId,
      roles: ['owner'],
      status: 'active',
    });
  });
  return tenant;
}

export async function createTestTenants(
  db: Pick<ScratchDatabase, 'appUrl' | 'systemUrl'>,
  options: CreateTestTenantsOptions = {},
): Promise<TestTenants> {
  const owned = options.context ? undefined : tenantContextFor(db);
  const context = options.context ?? (owned as OwnedTenantContext).context;
  const A = await provision(context, 'A');
  const B = await provision(context, 'B');
  return {
    A,
    B,
    context,
    asSchool: (tenant, fn) => asSchool(context, tenant, fn),
    asSystem: (fn) => asSystem(context, fn),
    close: async () => {
      await owned?.close();
    },
  };
}

export interface DevPrincipal {
  roles?: readonly string[];
  membershipId?: string | null;
  userId?: string;
}

export function authHeadersFor(
  tenant: Pick<TestTenant, 'schoolId' | 'ownerUserId'> | null,
  principal: DevPrincipal = {},
): Record<string, string> {
  const userId = principal.userId ?? tenant?.ownerUserId;
  if (!userId) throw new Error('authHeadersFor needs a tenant or a userId');
  return {
    'X-Dev-School': tenant?.schoolId ?? '',
    'X-Dev-User': userId,
    'X-Dev-Membership': principal.membershipId ?? '',
    'X-Dev-Roles': (principal.roles ?? []).join(','),
  };
}

export function authHeaders(
  tenant: Pick<TestTenant, 'schoolId' | 'ownerUserId' | 'ownerMembershipId'>,
): Record<string, string> {
  return authHeadersFor(tenant, { roles: ['owner'], membershipId: tenant.ownerMembershipId });
}
