import { StatusCodes } from 'http-status-codes';
import type {
  ConvertLeadRequest,
  ConvertLeadResponse,
  CreateLeadRequest,
  Lead,
  UpdateLeadRequest,
} from '../dto/index.js';
import { addStudent } from './collections.js';
import {
  body,
  commandResult,
  fail,
  inSchool,
  type MockContext,
  type MockResolver,
  page,
  requireSchool,
} from './context.js';
import { addInvitation } from './identity.js';
import type { MockStore } from './store.js';

const ENROLMENT_PAGE = 'enrolment_page';
const MANUAL_CONSENT = 'manual';

function requireFeature(context: MockContext, schoolId: string): void {
  if (!context.store.planFeatures(schoolId).includes(ENROLMENT_PAGE)) {
    fail(StatusCodes.FORBIDDEN, 'feature_not_in_plan', 'Your plan does not include this feature.');
  }
}

const alreadyConverted = (): never =>
  fail(StatusCodes.CONFLICT, 'lead_already_converted', 'This lead is already a student.');

function matches(lead: Lead, query: URLSearchParams): boolean {
  const status = query.get('status');
  const needle = query.get('q')?.trim().toLowerCase();
  const haystack = [lead.fullName, lead.phone ?? '', lead.email ?? ''].join(' ').toLowerCase();
  return (!status || lead.status === status) && (!needle || haystack.includes(needle));
}

const isEmail = (contact: string) => contact.includes('@');

type NewLead = Omit<CreateLeadRequest, 'consentTextVersion'> & {
  source: Lead['source'];
  consentTextVersion: string;
};

/** Stores a new lead (`status: new`) and returns its id. */
export function addLead(store: MockStore, schoolId: string, request: NewLead): string {
  const now = store.isoNow();
  const id = store.nextId();
  store.leads.set(id, {
    schoolId,
    version: 1,
    value: {
      id,
      status: 'new',
      source: request.source,
      fullName: request.fullName,
      phone: request.phone ?? null,
      email: request.email?.toLowerCase() ?? null,
      licenceClass: request.licenceClass,
      message: request.message ?? null,
      isMinor: request.isMinor,
      guardianName: request.guardianName ?? null,
      guardianContact: request.guardianContact ?? null,
      consentTextVersion: request.consentTextVersion,
      consentedAt: now,
      note: null,
      studentId: null,
      convertedAt: null,
      lostAt: null,
      lostReason: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
  });
  return id;
}

export const leadResolvers: Record<string, MockResolver> = {
  'leads.list': (context) => {
    const { schoolId } = requireSchool(context);
    const items = [...context.store.leads.values()]
      .filter((record) => record.schoolId === schoolId)
      .map((record) => record.value)
      .filter((lead) => matches(lead, context.url.searchParams))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { body: page(items, context.url) };
  },

  'leads.get': (context) => {
    const { schoolId } = requireSchool(context);
    return { body: inSchool(context.store.leads, context.params.id, schoolId).value };
  },

  'leads.create': (context) => {
    const { schoolId } = requireSchool(context);
    requireFeature(context, schoolId);
    const request = body<CreateLeadRequest>(context);
    const id = addLead(context.store, schoolId, {
      ...request,
      source: 'manual',
      consentTextVersion: request.consentTextVersion ?? MANUAL_CONSENT,
    });
    return { body: commandResult(id, 1) };
  },

  'leads.update': (context) => {
    const { schoolId } = requireSchool(context);
    const record = inSchool(context.store.leads, context.params.id, schoolId);
    const request = body<UpdateLeadRequest>(context);
    if (request.status !== undefined && record.value.status === 'converted') alreadyConverted();
    const now = context.store.isoNow();
    const lead = record.value;
    record.version += 1;
    record.value = {
      ...lead,
      ...(request.note !== undefined && { note: request.note || null }),
      ...(request.status !== undefined && { status: request.status }),
      ...(request.status === 'lost' && { lostAt: now, lostReason: request.lostReason ?? null }),
      ...(request.status === 'contacted' && { lostAt: null, lostReason: null }),
      version: record.version,
      updatedAt: now,
    };
    return { body: commandResult(lead.id, record.version) };
  },

  'leads.convert': (context) => {
    const { schoolId, membership } = requireSchool(context);
    const record = inSchool(context.store.leads, context.params.id, schoolId);
    const lead = record.value;
    if (lead.status === 'converted') alreadyConverted();
    const { invite, inviteParent, ...student } = body<ConvertLeadRequest>(context);
    const studentId = addStudent(context.store, schoolId, {
      ...student,
      fullName: lead.fullName,
      licenceClass: lead.licenceClass,
      phone: lead.phone,
      email: lead.email,
    });
    const invitationId =
      invite && (lead.phone ?? lead.email)
        ? addInvitation(context.store, schoolId, membership.id, {
            roles: ['student'],
            studentId,
            ...(lead.phone ? { phone: lead.phone } : { email: lead.email ?? '' }),
          }).id
        : null;
    const guardian = lead.guardianContact;
    const parentInvitationId =
      inviteParent && lead.isMinor && guardian
        ? addInvitation(context.store, schoolId, membership.id, {
            roles: ['parent'],
            studentId,
            ...(isEmail(guardian) ? { email: guardian } : { phone: guardian }),
          }).id
        : null;
    const now = context.store.isoNow();
    record.version += 1;
    record.value = {
      ...lead,
      status: 'converted',
      studentId,
      convertedAt: now,
      version: record.version,
      updatedAt: now,
    };
    const response: ConvertLeadResponse = {
      id: lead.id,
      version: record.version,
      studentId,
      invitationId,
      parentInvitationId,
    };
    return { body: response };
  },
};
