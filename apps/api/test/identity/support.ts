import { randomInt } from 'node:crypto';
import type { Response } from 'supertest';
import { newId } from '../../src/kernel/db/columns.js';
import { memberships, platformAdmins, users } from '../../src/modules/identity/infra/schema.js';
import { branches } from '../../src/modules/school/infra/schema.js';
import { students } from '../../src/modules/training/infra/schema.js';
import type { KernelTestApp } from '../support/kernel-app.js';
import type { TestTenant, TestTenants } from '../support/tenants.js';

export type MembershipStatus = 'invited' | 'pending_consent' | 'active' | 'disabled';

export interface MembershipInput {
  tenant: TestTenant;
  roles: string[];
  status?: MembershipStatus;
}

export interface UserInput {
  phone?: string;
  email?: string;
  memberships?: MembershipInput[];
  platformAdmin?: boolean;
}

export interface TestUser {
  userId: string;
  phone: string | null;
  email: string | null;
  membershipIds: string[];
}

export function uniquePhone(country = '49155'): string {
  return `+${country}${randomInt(10_000_000, 99_999_999)}`;
}

export function uniqueEmail(): string {
  return `user.${newId().slice(-12)}@example.com`;
}

export async function createUser(tenants: TestTenants, input: UserInput): Promise<TestUser> {
  const userId = newId();
  await tenants.asSystem(async (tx) => {
    await tx.insert(users).values({
      id: userId,
      fullName: `User ${userId.slice(-6)}`,
      phone: input.phone ?? null,
      email: input.email ?? null,
      locale: 'en',
    });
    if (input.platformAdmin) await tx.insert(platformAdmins).values({ userId });
  });
  const membershipIds: string[] = [];
  for (const membership of input.memberships ?? []) {
    const id = newId();
    await tenants.asSchool(membership.tenant, (tx) =>
      tx.insert(memberships).values({
        id,
        schoolId: membership.tenant.schoolId,
        userId,
        roles: membership.roles,
        status: membership.status ?? 'active',
      }),
    );
    membershipIds.push(id);
  }
  return { userId, phone: input.phone ?? null, email: input.email ?? null, membershipIds };
}

export function codeFrom(text: string | undefined): string {
  const match = /\b(\d{6})\b/.exec(text ?? '');
  if (!match?.[1]) throw new Error(`No 6-digit code in ${JSON.stringify(text)}`);
  return match[1];
}

export function decodeClaims(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  return JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}

const VOLATILE_HEADERS = new Set(['date', 'x-request-id']);

export function comparableResponse(res: Response) {
  return {
    status: res.status,
    text: res.text,
    headers: Object.fromEntries(
      Object.entries(res.headers).filter(([name]) => !VOLATILE_HEADERS.has(name)),
    ),
  };
}

export async function createStudent(
  tenants: TestTenants,
  tenant: TestTenant,
  input: { dateOfBirth: string; userId?: string },
): Promise<string> {
  const id = newId();
  await tenants.asSchool(tenant, (tx) =>
    tx.insert(students).values({
      id,
      schoolId: tenant.schoolId,
      userId: input.userId ?? null,
      dateOfBirth: input.dateOfBirth,
      licenceClass: 'B',
      examLanguage: 'en',
      status: 'active',
    }),
  );
  return id;
}

export async function createBranch(tenants: TestTenants, tenant: TestTenant): Promise<string> {
  const id = newId();
  await tenants.asSchool(tenant, (tx) =>
    tx.insert(branches).values({
      id,
      schoolId: tenant.schoolId,
      name: `Branch ${id.slice(-6)}`,
      address: '1 Test Street',
      lat: 52.5,
      lng: 13.4,
    }),
  );
  return id;
}

export function birthDateYearsAgo(years: number, extraDays = 0): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  date.setUTCDate(date.getUTCDate() + extraDays);
  return date.toISOString().slice(0, 10);
}

export async function waitForCode(kernel: KernelTestApp, contact: string): Promise<string> {
  for (let i = 0; i < 100; i += 1) {
    const message = contact.includes('@')
      ? kernel.email.sent.findLast((m) => m.to === contact)?.text
      : kernel.sms.sent.findLast((m) => m.to === contact)?.body;
    if (message) return codeFrom(message);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`No login code was sent to ${contact}`);
}
