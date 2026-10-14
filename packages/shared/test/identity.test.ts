import { describe, expect, it } from 'vitest';
import {
  InvitationCreated,
  MembershipCreated,
  MembershipDisabled,
  MembershipPermissionsChanged,
  MembershipRolesChanged,
  meResponseSchema,
  registerDeviceRequestSchema,
  requestLoginCodeRequestSchema,
  sessionResponseSchema,
  switchSchoolRequestSchema,
  verifyLoginCodeRequestSchema,
} from '../src/index.js';

const id = '0192f000-0001-7000-8000-000000000001';
const other = '0192f000-0002-7000-8000-000000000002';

describe('identity request DTOs', () => {
  it('requires a contact for a login code', () => {
    expect(requestLoginCodeRequestSchema.safeParse({ contact: '+4915550000002' }).success).toBe(
      true,
    );
    expect(requestLoginCodeRequestSchema.safeParse({}).success).toBe(false);
    expect(requestLoginCodeRequestSchema.safeParse({ contact: '' }).success).toBe(false);
  });

  it('accepts a 6-digit code and a web or mobile client on verify', () => {
    const body = { contact: 'a@example.com', code: '012345', client: 'mobile' };
    expect(verifyLoginCodeRequestSchema.parse(body)).toEqual(body);
    expect(verifyLoginCodeRequestSchema.safeParse({ ...body, code: '12345' }).success).toBe(false);
    expect(verifyLoginCodeRequestSchema.safeParse({ ...body, code: '12345a' }).success).toBe(false);
    expect(verifyLoginCodeRequestSchema.safeParse({ ...body, client: 'desktop' }).success).toBe(
      false,
    );
  });

  it('defaults the switch-school client to web', () => {
    expect(switchSchoolRequestSchema.parse({ membershipId: id })).toEqual({
      membershipId: id,
      client: 'web',
    });
    expect(switchSchoolRequestSchema.safeParse({ membershipId: 'x' }).success).toBe(false);
  });

  it('accepts ios and android devices only', () => {
    const body = { platform: 'ios', pushToken: 'ExponentPushToken[abc]', locale: 'en' };
    expect(registerDeviceRequestSchema.parse(body)).toEqual(body);
    expect(registerDeviceRequestSchema.safeParse({ ...body, platform: 'web' }).success).toBe(false);
  });
});

describe('identity response DTOs', () => {
  const membership = {
    membershipId: id,
    schoolId: other,
    schoolName: 'Fahrschule Spree',
    roles: ['owner', 'instructor'],
    status: 'active',
  };

  it('describes a session with an optional active membership', () => {
    const session = {
      accessToken: 'a.b.c',
      refreshToken: 'r',
      expiresIn: 900,
      memberships: [membership],
      activeMembershipId: null,
    };
    expect(sessionResponseSchema.parse(session)).toEqual(session);
    expect(sessionResponseSchema.safeParse({ ...session, activeMembershipId: id }).success).toBe(
      true,
    );
  });

  it('describes GET /v1/me', () => {
    const me = {
      user: { id, fullName: 'Otto', phone: null, email: 'o@example.com', locale: 'en' },
      memberships: [membership],
      active: {
        membershipId: id,
        schoolId: other,
        roles: ['owner'],
        grants: ['prices.manage'],
        studentId: null,
        features: ['enrolment_page'],
      },
    };
    expect(meResponseSchema.parse(me)).toEqual(me);
    expect(
      meResponseSchema.safeParse({ ...me, active: { ...me.active, studentId: other } }).success,
    ).toBe(true);
    expect(
      meResponseSchema.safeParse({ ...me, active: { ...me.active, grants: undefined } }).success,
    ).toBe(false);
    expect(
      meResponseSchema.safeParse({ ...me, active: { ...me.active, features: undefined } }).success,
    ).toBe(false);
    expect(meResponseSchema.safeParse({ ...me, active: null }).success).toBe(true);
  });
});

describe('identity events', () => {
  const membershipFields = { schoolId: other, membershipId: id, userId: other, roles: ['student'] };

  it.each([
    [MembershipCreated, { ...membershipFields, status: 'pending_consent', studentId: id }],
    [MembershipRolesChanged, { ...membershipFields, previousRoles: ['parent'], studentId: null }],
    [
      MembershipPermissionsChanged,
      { ...membershipFields, grants: ['prices.manage'], branchIds: [] },
    ],
    [MembershipDisabled, membershipFields],
  ] as const)('%s carries the school, membership, user and roles', (definition, payload) => {
    expect(definition.version).toBe(1);
    expect(definition.schema.parse(payload)).toEqual(payload);
    expect(definition.schema.safeParse({ ...payload, membershipId: undefined }).success).toBe(
      false,
    );
  });

  it('InvitationCreated carries the raw contact and the accept token for messaging', () => {
    const payload = {
      invitationId: id,
      schoolId: other,
      roles: ['student'],
      phone: '+4915550000099',
      email: null,
      studentId: null,
      invitedBy: other,
      expiresAt: '2026-10-15T10:00:00.000Z',
      acceptToken: 'raw-token',
    };
    expect(InvitationCreated.type).toBe('InvitationCreated');
    expect(InvitationCreated.schema.parse(payload)).toEqual(payload);
    expect(
      InvitationCreated.schema.safeParse({ ...payload, roles: ['platform_admin'] }).success,
    ).toBe(false);
  });
});
