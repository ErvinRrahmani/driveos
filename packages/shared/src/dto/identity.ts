import { z } from 'zod';
import { cursorPageQuerySchema } from './common.js';

export const membershipRoleSchema = z.enum(['owner', 'office', 'instructor', 'student', 'parent']);
export type MembershipRole = z.infer<typeof membershipRoleSchema>;

export const membershipStatusSchema = z.enum(['invited', 'pending_consent', 'active', 'disabled']);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

export const sessionClientSchema = z.enum(['web', 'mobile']);
export type SessionClient = z.infer<typeof sessionClientSchema>;

export const requestLoginCodeRequestSchema = z.object({
  contact: z.string().trim().min(3).max(254),
});
export type RequestLoginCodeRequest = z.infer<typeof requestLoginCodeRequestSchema>;

export const requestLoginCodeResponseSchema = z.object({});
export type RequestLoginCodeResponse = z.infer<typeof requestLoginCodeResponseSchema>;

export const verifyLoginCodeRequestSchema = z.object({
  contact: z.string().trim().min(3).max(254),
  code: z.string().regex(/^\d{6}$/),
  client: sessionClientSchema,
});
export type VerifyLoginCodeRequest = z.infer<typeof verifyLoginCodeRequestSchema>;

export const refreshSessionRequestSchema = z.object({
  refreshToken: z.string().min(1).max(512),
});
export type RefreshSessionRequest = z.infer<typeof refreshSessionRequestSchema>;

export const logoutRequestSchema = refreshSessionRequestSchema;
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;

export const membershipSummarySchema = z.object({
  membershipId: z.uuid(),
  schoolId: z.uuid(),
  schoolName: z.string(),
  roles: z.array(membershipRoleSchema),
  status: membershipStatusSchema,
});
export type MembershipSummary = z.infer<typeof membershipSummarySchema>;

export const sessionResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
  memberships: z.array(membershipSummarySchema),
  activeMembershipId: z.uuid().nullable(),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const meResponseSchema = z.object({
  user: z.object({
    id: z.uuid(),
    fullName: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    locale: z.string(),
  }),
  memberships: z.array(membershipSummarySchema),
  active: z
    .object({
      membershipId: z.uuid(),
      schoolId: z.uuid(),
      roles: z.array(membershipRoleSchema),
      grants: z.array(z.string()),
      studentId: z.uuid().nullable(),
      features: z.array(z.string()),
    })
    .nullable(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const switchSchoolRequestSchema = z.object({
  membershipId: z.uuid(),
  client: sessionClientSchema.default('web'),
});
export type SwitchSchoolRequest = z.infer<typeof switchSchoolRequestSchema>;

export const registerDeviceRequestSchema = z.object({
  platform: z.enum(['ios', 'android']),
  pushToken: z.string().trim().min(1).max(512),
  locale: z.string().trim().min(2).max(35),
});
export type RegisterDeviceRequest = z.infer<typeof registerDeviceRequestSchema>;

export const registerDeviceResponseSchema = z.object({
  id: z.uuid(),
});
export type RegisterDeviceResponse = z.infer<typeof registerDeviceResponseSchema>;

export const invitableRoleSchema = membershipRoleSchema.exclude(['owner']);
export type InvitableRole = z.infer<typeof invitableRoleSchema>;

const STUDENT_LINKED_ROLES: readonly InvitableRole[] = ['student', 'parent'];

export const createInvitationRequestSchema = z
  .strictObject({
    roles: z.array(invitableRoleSchema).min(1).max(4),
    phone: z.string().trim().min(3).max(32).optional(),
    email: z.string().trim().min(3).max(254).optional(),
    studentId: z.uuid().optional(),
    branchIds: z.array(z.uuid()).max(100).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.phone === undefined && body.email === undefined) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Give a phone or an email' });
    }
    const needsStudent = body.roles.some((role) => STUDENT_LINKED_ROLES.includes(role));
    if (needsStudent && body.studentId === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['studentId'],
        message: 'Student and parent invitations need a studentId',
      });
    }
    if (!needsStudent && body.studentId !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['studentId'],
        message: 'Only student and parent invitations take a studentId',
      });
    }
  });
export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;

export const createInvitationResponseSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  acceptToken: z.string().optional(),
});
export type CreateInvitationResponse = z.infer<typeof createInvitationResponseSchema>;

export const invitationSchema = z.object({
  id: z.uuid(),
  roles: z.array(membershipRoleSchema),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  studentId: z.uuid().nullable(),
  branchIds: z.array(z.uuid()),
  invitedBy: z.uuid(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type Invitation = z.infer<typeof invitationSchema>;

export const listInvitationsQuerySchema = cursorPageQuerySchema.extend({
  studentId: z.uuid().optional(),
  role: membershipRoleSchema.optional(),
});
export type ListInvitationsQuery = z.infer<typeof listInvitationsQuerySchema>;

export const invitationListResponseSchema = z.object({
  items: z.array(invitationSchema),
  nextCursor: z.uuid().nullable(),
});
export type InvitationListResponse = z.infer<typeof invitationListResponseSchema>;

export const acceptInvitationRequestSchema = z.strictObject({
  fullName: z.string().trim().min(1).max(200).optional(),
  locale: z.string().trim().min(2).max(35).optional(),
});
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;

export const acceptInvitationResponseSchema = z.object({
  membershipId: z.uuid(),
  userId: z.uuid(),
  status: membershipStatusSchema,
  studentId: z.uuid().nullable(),
});
export type AcceptInvitationResponse = z.infer<typeof acceptInvitationResponseSchema>;

export const updateMembershipRequestSchema = z
  .strictObject({
    roles: z.array(membershipRoleSchema).min(1).max(5).optional(),
    branchIds: z.array(z.uuid()).max(100).optional(),
    grants: z
      .strictObject({
        add: z.array(z.string().min(1).max(100)).max(100).optional(),
        remove: z.array(z.string().min(1).max(100)).max(100).optional(),
      })
      .optional(),
    disabled: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Give at least one of roles, branchIds, grants or disabled',
  });
export type UpdateMembershipRequest = z.infer<typeof updateMembershipRequestSchema>;
