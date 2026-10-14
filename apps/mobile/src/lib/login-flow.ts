import type { SessionResponse } from '@driveos/shared';
import type { AppServices } from './api';
import { toFailure } from './api-errors';
import type { FlowResult } from './flow';
import { type Destination, needsSchoolChoice, resolveDestination } from './route-group';

export type NextStep = FlowResult<{ next: Destination }>;

async function attempt<T>(call: () => Promise<{ data?: T; error?: unknown }>) {
  try {
    const { data, error } = await call();
    return data === undefined ? toFailure(error) : { ok: true as const, data };
  } catch (error) {
    return toFailure(error);
  }
}

function destinationOf(services: AppServices): Destination {
  return resolveDestination(services.auth.getState()) ?? '/login';
}

export async function requestLoginCode(
  services: AppServices,
  contact: string,
): Promise<FlowResult> {
  const result = await attempt(() =>
    services.api.fetchClient.POST('/v1/auth/code', { body: { contact: contact.trim() } }),
  );
  return result.ok ? { ok: true } : result;
}

async function startSession(services: AppServices, session: SessionResponse) {
  await services.resetCache();
  await services.auth.setSession(session);
}

export async function verifyLoginCode(
  services: AppServices,
  contact: string,
  code: string,
): Promise<NextStep> {
  const result = await attempt(() =>
    services.api.fetchClient.POST('/v1/auth/verify', {
      body: { contact: contact.trim(), code: code.trim(), client: 'mobile' },
    }),
  );
  if (!result.ok) return result;
  await startSession(services, result.data);
  if (needsSchoolChoice(result.data.memberships)) return { ok: true, next: '/choose-school' };
  return { ok: true, next: destinationOf(services) };
}

export async function chooseSchool(services: AppServices, membershipId: string): Promise<NextStep> {
  const result = await attempt(() =>
    services.api.fetchClient.POST('/v1/me/switch-school', {
      body: { membershipId, client: 'mobile' },
    }),
  );
  if (!result.ok) return result;
  await startSession(services, result.data);
  return { ok: true, next: destinationOf(services) };
}

export async function signOut(services: AppServices): Promise<void> {
  const { refreshToken } = services.auth.getState();
  if (refreshToken) {
    await services.api.fetchClient
      .POST('/v1/auth/logout', { body: { refreshToken } })
      .catch(() => undefined);
  }
  await services.auth.clear();
  await services.resetCache();
}
