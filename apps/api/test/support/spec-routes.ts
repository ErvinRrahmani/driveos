import { StatusCodes } from 'http-status-codes';

export type SuccessStatus =
  StatusCodes.OK | StatusCodes.CREATED | StatusCodes.ACCEPTED | StatusCodes.NO_CONTENT;

export interface SpecRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  tag: string;
  status: SuccessStatus;
  stub: boolean;
  produces?: 'application/pdf';
}

type Row = readonly [SpecRoute['method'], string, SuccessStatus, { produces?: 'application/pdf' }?];

function group(tag: string, stub: boolean, rows: readonly Row[]): SpecRoute[] {
  return rows.map(([method, path, status, extra]) => ({
    method,
    path,
    tag,
    status,
    stub,
    ...extra,
  }));
}

const identity: SpecRoute[] = [
  ...group('auth', false, [
    ['POST', '/v1/auth/code', StatusCodes.ACCEPTED],
    ['POST', '/v1/auth/verify', StatusCodes.OK],
    ['POST', '/v1/auth/refresh', StatusCodes.OK],
    ['POST', '/v1/auth/logout', StatusCodes.NO_CONTENT],
  ]),
  ...group('me', false, [
    ['GET', '/v1/me', StatusCodes.OK],
    ['POST', '/v1/me/switch-school', StatusCodes.OK],
  ]),
  ...group('invitations', false, [
    ['POST', '/v1/invitations', StatusCodes.CREATED],
    ['GET', '/v1/invitations', StatusCodes.OK],
    ['POST', '/v1/invitations/{token}/accept', StatusCodes.OK],
  ]),
  ...group('memberships', false, [['PATCH', '/v1/memberships/{id}', StatusCodes.OK]]),
  ...group('devices', false, [['POST', '/v1/devices', StatusCodes.CREATED]]),
];

const school = [
  ...group('school', false, [
    ['GET', '/v1/school', StatusCodes.OK],
    ['PATCH', '/v1/school', StatusCodes.OK],
    ['GET', '/v1/school/settings', StatusCodes.OK],
    ['PATCH', '/v1/school/settings', StatusCodes.OK],
    ['GET', '/v1/school/opening-hours', StatusCodes.OK],
    ['PUT', '/v1/school/opening-hours', StatusCodes.OK],
    ['GET', '/v1/branches', StatusCodes.OK],
    ['POST', '/v1/branches', StatusCodes.CREATED],
    ['PATCH', '/v1/branches/{id}', StatusCodes.OK],
    ['GET', '/v1/vehicles', StatusCodes.OK],
    ['POST', '/v1/vehicles', StatusCodes.CREATED],
    ['PATCH', '/v1/vehicles/{id}', StatusCodes.OK],
    ['GET', '/v1/staff', StatusCodes.OK],
    ['POST', '/v1/school/payment-account', StatusCodes.OK],
  ]),
  // Enrolment page (design 2026-10-14 §5): the public page and its settings, and reviews.
  ...group('school', false, [
    ['GET', '/v1/school/public-profile', StatusCodes.OK],
    ['PUT', '/v1/school/public-profile', StatusCodes.OK],
    ['GET', '/v1/public/schools/{slug}', StatusCodes.OK],
  ]),
  ...group('reviews', false, [
    ['POST', '/v1/reviews', StatusCodes.CREATED],
    ['GET', '/v1/reviews', StatusCodes.OK],
    ['PATCH', '/v1/reviews/{id}', StatusCodes.OK],
  ]),
];

const scheduling = [
  ...group('scheduling', false, [
    ['GET', '/v1/lesson-types', StatusCodes.OK],
    ['POST', '/v1/lesson-types', StatusCodes.CREATED],
    ['PATCH', '/v1/lesson-types/{id}', StatusCodes.OK],
    ['GET', '/v1/calendar', StatusCodes.OK],
    ['GET', '/v1/calendar/free-slots', StatusCodes.OK],
    ['GET', '/v1/instructors/{id}/availability', StatusCodes.OK],
    ['PUT', '/v1/instructors/{id}/availability', StatusCodes.OK],
    ['POST', '/v1/instructors/{id}/time-off', StatusCodes.CREATED],
    ['POST', '/v1/lessons', StatusCodes.CREATED],
    ['POST', '/v1/lessons/{id}/cancel', StatusCodes.OK],
    ['PATCH', '/v1/lessons/{id}', StatusCodes.OK],
    ['POST', '/v1/lessons/{id}/complete', StatusCodes.OK],
    ['POST', '/v1/lessons/{id}/no-show', StatusCodes.OK],
  ]),
  ...group('scheduling', false, [
    ['GET', '/v1/sync', StatusCodes.OK],
    ['POST', '/v1/sync', StatusCodes.OK],
  ]),
  ...group('scheduling', false, [
    ['GET', '/v1/waiting-list', StatusCodes.OK],
    ['POST', '/v1/waiting-list', StatusCodes.CREATED],
    ['DELETE', '/v1/waiting-list/{id}', StatusCodes.NO_CONTENT],
    ['GET', '/v1/slot-offers', StatusCodes.OK],
    ['POST', '/v1/slot-offers', StatusCodes.CREATED],
    ['POST', '/v1/slot-offers/{id}/accept', StatusCodes.CREATED],
  ]),
];

const training = [
  ...group('training', false, [
    ['GET', '/v1/students', StatusCodes.OK],
    ['POST', '/v1/students', StatusCodes.CREATED],
    ['GET', '/v1/students/{id}', StatusCodes.OK],
    ['PATCH', '/v1/students/{id}', StatusCodes.OK],
    ['GET', '/v1/students/{id}/instructors', StatusCodes.OK],
    ['PUT', '/v1/students/{id}/instructors', StatusCodes.OK],
    ['POST', '/v1/students/{id}/enrolments', StatusCodes.CREATED],
    ['POST', '/v1/students/{id}/guardians', StatusCodes.CREATED],
    ['POST', '/v1/guardians/{linkId}/consent', StatusCodes.OK],
    ['POST', '/v1/students/{id}/archive', StatusCodes.OK],
    ['GET', '/v1/students/{id}/progress', StatusCodes.OK],
    ['POST', '/v1/students/{id}/test-attempts', StatusCodes.CREATED],
    ['GET', '/v1/syllabus', StatusCodes.OK],
    ['POST', '/v1/students/{id}/export', StatusCodes.OK],
    ['DELETE', '/v1/students/{id}', StatusCodes.OK],
  ]),
  // Not in SPEC §8: TASKS 4c asks for private notes as "a separate query" with a staff edit route.
  ...group('training', false, [
    ['GET', '/v1/students/{id}/private-notes', StatusCodes.OK],
    ['PUT', '/v1/students/{id}/private-notes/{lessonId}', StatusCodes.OK],
  ]),
  // Not in SPEC §8: step 7 adds the caller's guardian links for the parent app's consent screens.
  ...group('training', false, [['GET', '/v1/guardian-links', StatusCodes.OK]]),
  // Enrolment page (design 2026-10-14 §5): the public enquiry form and the lead inbox.
  ...group('leads', false, [
    ['POST', '/v1/public/schools/{slug}/leads', StatusCodes.CREATED],
    ['GET', '/v1/leads', StatusCodes.OK],
    ['POST', '/v1/leads', StatusCodes.CREATED],
    ['GET', '/v1/leads/{id}', StatusCodes.OK],
    ['PATCH', '/v1/leads/{id}', StatusCodes.OK],
    ['POST', '/v1/leads/{id}/convert', StatusCodes.CREATED],
  ]),
];

const theory = [
  ...group('theory', false, [
    ['GET', '/v1/question-packs/current', StatusCodes.OK],
    ['POST', '/v1/theory/sessions', StatusCodes.CREATED],
    ['POST', '/v1/theory/sessions/{id}/answers', StatusCodes.OK],
    ['POST', '/v1/theory/sessions/{id}/finish', StatusCodes.OK],
    ['GET', '/v1/theory/mistakes', StatusCodes.OK],
    ['GET', '/v1/theory/stats', StatusCodes.OK],
  ]),
];

const billing = group('billing', false, [
  ['GET', '/v1/price-items', StatusCodes.OK],
  ['POST', '/v1/price-items', StatusCodes.CREATED],
  ['PATCH', '/v1/price-items/{id}', StatusCodes.OK],
  ['GET', '/v1/shop', StatusCodes.OK],
  ['GET', '/v1/students/{id}/balance', StatusCodes.OK],
  ['GET', '/v1/students/{id}/ledger', StatusCodes.OK],
  ['POST', '/v1/ledger/adjustments', StatusCodes.CREATED],
  ['POST', '/v1/checkout', StatusCodes.CREATED],
  ['GET', '/v1/invoices', StatusCodes.OK],
  ['GET', '/v1/invoices/{id}.pdf', StatusCodes.OK, { produces: 'application/pdf' }],
  ['POST', '/v1/refunds', StatusCodes.CREATED],
  ['POST', '/v1/payments/cash', StatusCodes.CREATED],
  ['POST', '/v1/webhooks/payments/{provider}', StatusCodes.OK],
  ['GET', '/v1/platform-statements', StatusCodes.OK],
]);

const documents: SpecRoute[] = [
  ...group('documents', false, [
    ['POST', '/v1/documents/upload-url', StatusCodes.CREATED],
    ['POST', '/v1/documents/{id}/complete', StatusCodes.OK],
    ['GET', '/v1/documents', StatusCodes.OK],
    ['GET', '/v1/documents/{id}/download-url', StatusCodes.OK],
    ['GET', '/v1/contract-templates', StatusCodes.OK],
    ['POST', '/v1/contract-templates', StatusCodes.CREATED],
    ['POST', '/v1/contracts', StatusCodes.CREATED],
    ['GET', '/v1/contracts/{id}', StatusCodes.OK],
    ['POST', '/v1/contracts/{id}/sign', StatusCodes.OK],
  ]),
  // Not in SPEC §8: the admin and mobile contract screens need a list of a student's contracts.
  ...group('documents', false, [['GET', '/v1/contracts', StatusCodes.OK]]),
];

const messaging = group('messaging', false, [
  ['GET', '/v1/conversations', StatusCodes.OK],
  ['GET', '/v1/conversations/{id}/messages', StatusCodes.OK],
  ['POST', '/v1/conversations/{id}/messages', StatusCodes.CREATED],
  ['POST', '/v1/conversations/{id}/read', StatusCodes.OK],
]);

const reporting = group('reporting', false, [
  ['GET', '/v1/reports/growth', StatusCodes.OK],
  ['GET', '/v1/reports/no-shows', StatusCodes.OK],
  ['GET', '/v1/reports/revenue', StatusCodes.OK],
  ['GET', '/v1/reports/pass-rate', StatusCodes.OK],
  ['GET', '/v1/reports/utilisation', StatusCodes.OK],
]);

const platform = [
  ...group('platform', false, [
    ['POST', '/v1/platform/schools', StatusCodes.CREATED],
    ['GET', '/v1/platform/plans', StatusCodes.OK],
    ['POST', '/v1/platform/plans', StatusCodes.CREATED],
    ['PATCH', '/v1/platform/plans/{id}', StatusCodes.OK],
    ['GET', '/v1/platform/alerts', StatusCodes.OK],
    ['GET', '/v1/platform/statements', StatusCodes.OK],
    ['POST', '/v1/platform/statements/{id}/mark-paid', StatusCodes.OK],
    ['POST', '/v1/platform/support-sessions', StatusCodes.CREATED],
    ['POST', '/v1/platform/support-sessions/{id}/end', StatusCodes.OK],
    ['GET', '/v1/audit-log', StatusCodes.OK],
    ['POST', '/v1/platform/question-packs/import', StatusCodes.CREATED],
    ['POST', '/v1/platform/question-packs/{id}/publish', StatusCodes.OK],
  ]),
];

export const SPEC_ROUTES: readonly SpecRoute[] = [
  ...identity,
  ...school,
  ...scheduling,
  ...training,
  ...theory,
  ...billing,
  ...documents,
  ...messaging,
  ...reporting,
  ...platform,
];

export const IDEMPOTENT_ROUTES: readonly string[] = [
  'POST /v1/checkout',
  'POST /v1/refunds',
  'POST /v1/payments/cash',
  'POST /v1/ledger/adjustments',
  'POST /v1/lessons',
  'POST /v1/slot-offers/:id/accept',
  'POST /v1/leads/:id/convert',
];

export const PUBLIC_STUB_ROUTES: readonly string[] = [];

export function expressKey(route: Pick<SpecRoute, 'method' | 'path'>): string {
  return `${route.method} ${route.path.replace(/\{([A-Za-z0-9_]+)\}/g, ':$1')}`;
}

export const STUB_ROUTES: readonly SpecRoute[] = SPEC_ROUTES.filter((route) => route.stub);
