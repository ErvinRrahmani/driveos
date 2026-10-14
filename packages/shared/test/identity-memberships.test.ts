import { describe, expect, it } from 'vitest';
import {
  acceptInvitationRequestSchema,
  acceptInvitationResponseSchema,
  createInvitationRequestSchema,
  createInvitationResponseSchema,
  cursorPageQuerySchema,
  GuardianConsentGiven,
  invitationListResponseSchema,
  MembershipCreated,
  MembershipRolesChanged,
  updateMembershipRequestSchema,
} from '../src/index.js';

const id = '0192f000-0001-7000-8000-000000000001';
const other = '0192f000-0002-7000-8000-000000000002';

describe('POST /v1/invitations body', () => {
  const ok = (body: unknown) => createInvitationRequestSchema.safeParse(body).success;

  it('accepts staff roles with a phone or an email', () => {
    expect(ok({ roles: ['instructor'], email: 'i@example.com' })).toBe(true);
    expect(ok({ roles: ['office', 'instructor'], phone: '+4915550000001', branchIds: [id] })).toBe(
      true,
    );
  });

  it('never invites an owner or an unknown role', () => {
    expect(ok({ roles: ['owner'], email: 'o@example.com' })).toBe(false);
    expect(ok({ roles: ['platform_admin'], email: 'o@example.com' })).toBe(false);
    expect(ok({ roles: [], email: 'o@example.com' })).toBe(false);
  });

  it('needs a contact', () => {
    expect(ok({ roles: ['instructor'] })).toBe(false);
  });

  it('needs a studentId exactly for student and parent invitations', () => {
    expect(ok({ roles: ['student'], email: 's@example.com' })).toBe(false);
    expect(ok({ roles: ['parent'], phone: '+4915550000001' })).toBe(false);
    expect(ok({ roles: ['student'], email: 's@example.com', studentId: id })).toBe(true);
    expect(ok({ roles: ['parent'], email: 'p@example.com', studentId: id })).toBe(true);
    expect(ok({ roles: ['instructor'], email: 'i@example.com', studentId: id })).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(ok({ roles: ['instructor'], email: 'i@example.com', schoolId: id })).toBe(false);
  });

  it('answers with the id, the version and an optional accept token', () => {
    expect(createInvitationResponseSchema.parse({ id, version: 1 })).toEqual({ id, version: 1 });
    expect(
      createInvitationResponseSchema.parse({ id, version: 1, acceptToken: 'tok' }).acceptToken,
    ).toBe('tok');
  });
});

describe('GET /v1/invitations', () => {
  it('pages with a cursor and a bounded limit (default 50)', () => {
    expect(cursorPageQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(cursorPageQuerySchema.parse({ cursor: id, limit: '10' })).toEqual({
      cursor: id,
      limit: 10,
    });
    expect(cursorPageQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(cursorPageQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });

  it('lists invitations and the next cursor', () => {
    const list = {
      items: [
        {
          id,
          roles: ['student'],
          phone: null,
          email: 's@example.com',
          studentId: other,
          branchIds: [],
          invitedBy: other,
          expiresAt: '2026-10-15T10:00:00.000Z',
          createdAt: '2026-10-08T10:00:00.000Z',
        },
      ],
      nextCursor: null,
    };
    expect(invitationListResponseSchema.parse(list)).toEqual(list);
  });
});

describe('POST /v1/invitations/{token}/accept', () => {
  it('takes an optional full name and locale', () => {
    expect(acceptInvitationRequestSchema.parse({})).toEqual({});
    expect(acceptInvitationRequestSchema.parse({ fullName: ' Ann Lee ', locale: 'en' })).toEqual({
      fullName: 'Ann Lee',
      locale: 'en',
    });
    expect(acceptInvitationRequestSchema.safeParse({ fullName: '' }).success).toBe(false);
  });

  it('answers with the membership, user, status and student', () => {
    const body = { membershipId: id, userId: other, status: 'pending_consent', studentId: id };
    expect(acceptInvitationResponseSchema.parse(body)).toEqual(body);
  });
});

describe('PATCH /v1/memberships/{id} body', () => {
  const ok = (body: unknown) => updateMembershipRequestSchema.safeParse(body).success;

  it('accepts roles, branches, grants and disabled', () => {
    expect(ok({ roles: ['owner', 'instructor'] })).toBe(true);
    expect(ok({ branchIds: [] })).toBe(true);
    expect(ok({ grants: { add: ['prices.manage'], remove: [] } })).toBe(true);
    expect(ok({ disabled: true })).toBe(true);
  });

  it('rejects an empty patch, empty roles and unknown fields', () => {
    expect(ok({})).toBe(false);
    expect(ok({ roles: [] })).toBe(false);
    expect(ok({ roles: ['platform_admin'] })).toBe(false);
    expect(ok({ status: 'active' })).toBe(false);
  });
});

describe('membership events carry the invited student for training (4c)', () => {
  const fields = { schoolId: other, membershipId: id, userId: other, roles: ['student'] };

  it('defaults studentId to null', () => {
    expect(MembershipCreated.schema.parse({ ...fields, status: 'active' }).studentId).toBeNull();
    expect(
      MembershipRolesChanged.schema.parse({ ...fields, previousRoles: [] }).studentId,
    ).toBeNull();
  });
});

describe('GuardianConsentGiven (training, consumed by identity)', () => {
  it('names the student user so identity needs no cross-module read', () => {
    const payload = {
      schoolId: other,
      studentId: id,
      guardianLinkId: id,
      guardianUserId: other,
      studentUserId: other,
      consentTextVersion: '2026-01',
    };
    expect(GuardianConsentGiven.type).toBe('GuardianConsentGiven');
    expect(GuardianConsentGiven.version).toBe(1);
    expect(GuardianConsentGiven.schema.parse(payload)).toEqual(payload);
    expect(GuardianConsentGiven.schema.safeParse({ ...payload, studentUserId: null }).success).toBe(
      true,
    );
  });
});
