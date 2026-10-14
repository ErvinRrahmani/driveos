import { z } from 'zod';
import { membershipRoleSchema, membershipStatusSchema } from '../dto/identity.js';
import { defineEvent } from './define-event.js';

const membershipFields = {
  schoolId: z.uuid(),
  membershipId: z.uuid(),
  userId: z.uuid(),
  roles: z.array(membershipRoleSchema),
};

export const InvitationCreated = defineEvent({
  type: 'InvitationCreated',
  version: 1,
  schema: z.object({
    invitationId: z.uuid(),
    schoolId: z.uuid(),
    roles: z.array(membershipRoleSchema).min(1),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    studentId: z.uuid().nullable(),
    invitedBy: z.uuid(),
    expiresAt: z.iso.datetime(),
    acceptToken: z.string().min(1),
  }),
});

export const MembershipCreated = defineEvent({
  type: 'MembershipCreated',
  version: 1,
  schema: z.object({
    ...membershipFields,
    status: membershipStatusSchema,
    studentId: z.uuid().nullable().default(null),
  }),
});

export const MembershipRolesChanged = defineEvent({
  type: 'MembershipRolesChanged',
  version: 1,
  schema: z.object({
    ...membershipFields,
    previousRoles: z.array(membershipRoleSchema),
    studentId: z.uuid().nullable().default(null),
  }),
});

export const MembershipPermissionsChanged = defineEvent({
  type: 'MembershipPermissionsChanged',
  version: 1,
  schema: z.object({
    ...membershipFields,
    grants: z.array(z.string().min(1)),
    branchIds: z.array(z.uuid()),
  }),
});

export const MembershipDisabled = defineEvent({
  type: 'MembershipDisabled',
  version: 1,
  schema: z.object(membershipFields),
});
