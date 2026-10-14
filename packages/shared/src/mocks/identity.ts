import type {
  AcceptInvitationRequest,
  CreateInvitationRequest,
  MeResponse,
  MembershipSummary,
  RefreshSessionRequest,
  SessionResponse,
  SwitchSchoolRequest,
  UpdateMembershipRequest,
  VerifyLoginCodeRequest,
} from '../dto/index.js';
import {
  body,
  commandResult,
  fail,
  type MockResolver,
  notFound,
  requireSchool,
  requireSession,
} from './context.js';
import type { MockSession, MockStore, MockUser } from './store.js';
import { StatusCodes } from 'http-status-codes';

export const MOCK_LOGIN_CODE = '000000';
const ACCESS_TOKEN_SECONDS = 900;
const INVITATION_DAYS = 7;

function memberships(store: MockStore, userId: string): MembershipSummary[] {
  return [...store.memberships.values()]
    .filter((membership) => membership.userId === userId && membership.status !== 'disabled')
    .map((membership) => ({
      membershipId: membership.id,
      schoolId: membership.schoolId,
      schoolName: store.schools.get(membership.schoolId)?.name ?? '',
      roles: [...membership.roles],
      status: membership.status,
    }));
}

export function sessionResponse(store: MockStore, session: MockSession): SessionResponse {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresIn: ACCESS_TOKEN_SECONDS,
    memberships: memberships(store, session.userId),
    activeMembershipId: session.activeMembershipId,
  };
}

function findUser(store: MockStore, contact: string): MockUser | undefined {
  const needle = contact.trim().toLowerCase();
  return [...store.users.values()].find(
    (user) => user.phone === needle || user.email?.toLowerCase() === needle,
  );
}

function sessionByRefresh(store: MockStore, refreshToken: string): MockSession | undefined {
  return [...store.sessions.values()].find((session) => session.refreshToken === refreshToken);
}

/** Stores a pending invitation, as `POST /v1/invitations` and lead conversion do. */
export function addInvitation(
  store: MockStore,
  schoolId: string,
  invitedBy: string,
  request: CreateInvitationRequest,
): { id: string; acceptToken: string } {
  const now = store.now();
  const token = store.nextToken('invite');
  const id = store.nextId();
  store.invitations.set(token, {
    token,
    schoolId,
    acceptedAt: null,
    invitation: {
      id,
      roles: request.roles,
      phone: request.phone ?? null,
      email: request.email ?? null,
      studentId: request.studentId ?? null,
      branchIds: request.branchIds ?? [],
      invitedBy,
      expiresAt: new Date(now.getTime() + INVITATION_DAYS * 86_400_000).toISOString(),
      createdAt: now.toISOString(),
    },
  });
  return { id, acceptToken: token };
}

export const identityResolvers: Record<string, MockResolver> = {
  getHealth: () => ({ body: { status: 'ok', service: 'api' } }),

  requestLoginCode: () => ({ body: {} }),

  verifyLoginCode: (context) => {
    const { contact, code } = body<VerifyLoginCodeRequest>(context);
    const user = findUser(context.store, contact);
    if (!user || code !== MOCK_LOGIN_CODE)
      fail(StatusCodes.UNAUTHORIZED, 'invalid_code', 'The code is wrong or has expired.');
    return { body: sessionResponse(context.store, context.store.createSession(user.id)) };
  },

  refreshSession: (context) => {
    const { refreshToken } = body<RefreshSessionRequest>(context);
    const previous = sessionByRefresh(context.store, refreshToken);
    if (!previous)
      return fail(
        StatusCodes.UNAUTHORIZED,
        'unauthenticated',
        'The session has ended. Sign in again.',
      );
    context.store.endSession(previous.accessToken);
    const next = context.store.createSession(previous.userId, previous.activeMembershipId);
    return { body: sessionResponse(context.store, next) };
  },

  logout: (context) => {
    const { refreshToken } = body<RefreshSessionRequest>(context);
    const session = sessionByRefresh(context.store, refreshToken);
    if (session) context.store.endSession(session.accessToken);
    return {};
  },

  getMe: (context) => {
    const session = requireSession(context);
    const user = context.store.users.get(session.userId) ?? notFound();
    const active = session.activeMembershipId
      ? context.store.memberships.get(session.activeMembershipId)
      : undefined;
    const me: MeResponse = {
      user: { ...user },
      memberships: memberships(context.store, user.id),
      active: active
        ? {
            membershipId: active.id,
            schoolId: active.schoolId,
            roles: [...active.roles],
            grants: [...active.grants],
            studentId: active.roles.includes('student')
              ? ([...context.store.students.values()].find(
                  (student) =>
                    student.schoolId === active.schoolId && student.value.userId === active.userId,
                )?.value.id ?? null)
              : null,
            features: context.store.planFeatures(active.schoolId),
          }
        : null,
    };
    return { body: me };
  },

  switchSchool: (context) => {
    const session = requireSession(context);
    const { membershipId } = body<SwitchSchoolRequest>(context);
    const membership = context.store.memberships.get(membershipId);
    if (!membership || membership.userId !== session.userId || membership.status !== 'active') {
      return notFound();
    }
    session.activeMembershipId = membership.id;
    return { body: sessionResponse(context.store, session) };
  },

  registerDevice: (context) => {
    requireSession(context);
    return { body: { id: context.store.nextId() } };
  },

  createInvitation: (context) => {
    const { schoolId, membership } = requireSchool(context);
    const created = addInvitation(
      context.store,
      schoolId,
      membership.id,
      body<CreateInvitationRequest>(context),
    );
    return { body: { ...created, version: 1 } };
  },

  listInvitations: (context) => {
    const { schoolId } = requireSchool(context);
    const studentId = context.url.searchParams.get('studentId');
    const role = context.url.searchParams.get('role');
    const items = [...context.store.invitations.values()]
      .filter((record) => record.schoolId === schoolId && record.acceptedAt === null)
      .map((record) => record.invitation)
      .filter(
        (invitation) =>
          (!studentId || invitation.studentId === studentId) &&
          (!role || invitation.roles.some((r) => r === role)),
      );
    return { body: { items, nextCursor: null } };
  },

  acceptInvitation: (context) => {
    const { store } = context;
    const record = store.invitations.get(context.params.token ?? '');
    const now = store.now();
    if (
      !record ||
      record.acceptedAt !== null ||
      Date.parse(record.invitation.expiresAt) < now.getTime()
    ) {
      return notFound();
    }
    const request = body<AcceptInvitationRequest>(context);
    const { invitation } = record;
    const contact = invitation.phone ?? invitation.email ?? '';
    let user = findUser(store, contact);
    if (!user) {
      user = {
        id: store.nextId(),
        fullName: request.fullName ?? contact,
        phone: invitation.phone,
        email: invitation.email,
        locale: request.locale ?? 'en',
      };
      store.users.set(user.id, user);
    }
    const membershipId = store.nextId();
    store.memberships.set(membershipId, {
      id: membershipId,
      userId: user.id,
      schoolId: record.schoolId,
      roles: [...invitation.roles],
      status: 'active',
      branchIds: [...invitation.branchIds],
      grants: [],
      version: 1,
    });
    const student = invitation.studentId ? store.students.get(invitation.studentId) : undefined;
    if (student && invitation.roles.includes('student')) student.value.userId = user.id;
    record.acceptedAt = now.toISOString();
    return {
      body: { membershipId, userId: user.id, status: 'active', studentId: invitation.studentId },
    };
  },

  updateMembership: (context) => {
    const { schoolId } = requireSchool(context);
    const membership = context.store.memberships.get(context.params.id ?? '');
    if (!membership || membership.schoolId !== schoolId) return notFound();
    const request = body<UpdateMembershipRequest>(context);
    if (request.roles) membership.roles = [...request.roles];
    if (request.branchIds) membership.branchIds = [...request.branchIds];
    if (request.grants) {
      const removed = new Set(request.grants.remove ?? []);
      const kept = membership.grants.filter((grant) => !removed.has(grant));
      membership.grants = [...new Set([...kept, ...(request.grants.add ?? [])])].sort();
    }
    if (request.disabled !== undefined)
      membership.status = request.disabled ? 'disabled' : 'active';
    membership.version += 1;
    return { body: commandResult(membership.id, membership.version) };
  },
};
