import type { RegisteredRoute } from './cross-tenant.js';

export interface PermissionExemption {
  reason: string;
}

export const PERMISSION_ALLOWLIST: Record<string, PermissionExemption> = {
  'GET /v1/me': { reason: "the caller's own user and memberships; works without a school" },
  'POST /v1/me/switch-school': {
    reason: 'the caller picks one of their own active memberships; works without a school',
  },
  'POST /v1/devices': { reason: "the caller's own push token; works without a school" },
};

export function undeclaredRoutes(
  routes: readonly RegisteredRoute[],
  allowlist: Record<string, unknown>,
): string[] {
  const problems: string[] = [];
  const registered = new Set(routes.map((route) => route.key));
  for (const route of routes) {
    if (route.source !== 'controller' || route.isPublic) continue;
    const allowed = route.key in allowlist;
    if (!route.permissions && !allowed) {
      problems.push(
        `${route.key} declares no @RequirePermission(...) and is not in apps/api/test/support/permission-allowlist.ts`,
      );
    }
    if (route.permissions && allowed) {
      problems.push(`${route.key} declares a permission and is also on the permission allowlist`);
    }
  }
  for (const key of Object.keys(allowlist)) {
    if (!registered.has(key))
      problems.push(`${key} is on the permission allowlist but not registered`);
  }
  return problems;
}
