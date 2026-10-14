import type { RouteAllowlist } from './cross-tenant.js';

const docs = (path: string) =>
  [
    `GET ${path}`,
    { reason: 'public', note: 'Swagger UI / OpenAPI document, no tenant data' },
  ] as const;

export const ROUTE_ALLOWLIST: RouteAllowlist = {
  'GET /v1/health': { reason: 'public', note: 'liveness probe, no tenant data' },
  'POST /v1/auth/code': {
    reason: 'public',
    note: 'login: always 202 {}, reads only SECURITY DEFINER auth_login_allowed',
  },
  'POST /v1/auth/verify': {
    reason: 'public',
    note: "login: the session belongs to the code's contact, never to a school chosen by the client",
  },
  'POST /v1/auth/refresh': {
    reason: 'public',
    note: 'login: the refresh token itself is the credential; school comes from its membership',
  },
  'POST /v1/auth/logout': {
    reason: 'public',
    note: 'login: revokes only the presented refresh token family, always 204',
  },
  'POST /v1/webhooks/payments/:provider': {
    reason: 'public',
    note: 'payment provider webhook: authenticated by the provider signature, school resolved via SECURITY DEFINER billing_school_for_payment (SPEC §6.2)',
  },
  'GET /v1/public/schools/:slug': {
    reason: 'public',
    note: 'public enrolment page: school resolved via SECURITY DEFINER school_id_for_public_slug; only published data',
  },
  'GET /fake-pay/:ref': {
    reason: 'public',
    note: 'dev/test fake payment page (404 in production); shows only the amount of a fake checkout reference',
  },
  'POST /fake-pay/:ref/:outcome': {
    reason: 'public',
    note: 'dev/test fake payment page (404 in production); signs and posts the webhook for a fake checkout reference',
  },
  'GET /v1/me': {
    reason: 'caller-scoped',
    note: "the caller's own user row and memberships (auth_memberships_for_user)",
  },
  ...Object.fromEntries(
    [
      '/docs',
      '/docs/',
      '/docs/index.html',
      '/docs/LICENSE',
      '/docs/swagger-ui-init.js',
      '/docs/docs/swagger-ui-init.js',
      '/docs-json',
      '/docs-yaml',
    ].map(docs),
  ),
};
