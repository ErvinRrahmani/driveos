import type {
  BookLessonRequest,
  CheckoutRequest,
  LessonResponse,
  SignContractResponse,
} from '@driveos/shared';
import { openBrowserAsync } from 'expo-web-browser';
import type { AppServices } from './api';
import { type ApiFailure, NETWORK_ERROR } from './api-errors';
import { type Attempt, failure, type FlowResult, send, sendIdempotent } from './flow';

export { createAttempt, type Attempt } from './flow';

export const SHOP_HREF = '/student/shop';

export type Recovery =
  | { kind: 'none' }
  | { kind: 'retry' }
  | { kind: 'buyCredit'; href: typeof SHOP_HREF }
  | { kind: 'slotTaken' }
  | { kind: 'offerGone' }
  | { kind: 'error' };

const idempotencyHeader = (key: string) => ({ header: { 'Idempotency-Key': key } });

export async function resolveStudentId(
  services: AppServices,
): Promise<FlowResult<{ studentId: string }>> {
  const result = await send(() => services.api.fetchClient.GET('/v1/shop'));
  return result.ok ? { ok: true, studentId: result.data.studentId } : failure(result);
}

export async function bookLesson(
  services: AppServices,
  attempt: Attempt,
  body: BookLessonRequest,
): Promise<FlowResult<{ lesson: LessonResponse }>> {
  const result = await sendIdempotent(attempt, body, (key) =>
    services.api.fetchClient.POST('/v1/lessons', { params: idempotencyHeader(key), body }),
  );
  return result.ok ? { ok: true, lesson: result.data } : failure(result);
}

function commonRecovery(result: FlowResult | ApiFailure): Recovery | null {
  if (result.ok) return { kind: 'none' };
  if (result.code === NETWORK_ERROR) return { kind: 'retry' };
  if (result.code === 'insufficient_balance') return { kind: 'buyCredit', href: SHOP_HREF };
  return null;
}

export function bookingRecovery(result: FlowResult | ApiFailure): Recovery {
  const common = commonRecovery(result);
  if (common) return common;
  return !result.ok && result.code === 'lesson_conflict'
    ? { kind: 'slotTaken' }
    : { kind: 'error' };
}

export function offerRecovery(result: FlowResult | ApiFailure): Recovery {
  const common = commonRecovery(result);
  if (common) return common;
  return !result.ok && (result.code === 'offer_unavailable' || result.code === 'lesson_conflict')
    ? { kind: 'offerGone' }
    : { kind: 'error' };
}

export async function cancelLesson(
  services: AppServices,
  lesson: { id: string; version: number },
  reason?: string,
): Promise<FlowResult<{ late: boolean; minutesRestored: number }>> {
  const result = await send(() =>
    services.api.fetchClient.POST('/v1/lessons/{id}/cancel', {
      params: { path: { id: lesson.id } },
      body: { version: lesson.version, ...(reason ? { reason } : {}) },
    }),
  );
  if (!result.ok) return failure(result);
  return { ok: true, late: result.data.late, minutesRestored: result.data.minutesRestored };
}

export async function acceptOffer(
  services: AppServices,
  attempt: Attempt,
  offerId: string,
): Promise<FlowResult<{ lesson: LessonResponse }>> {
  const result = await sendIdempotent(attempt, offerId, (key) =>
    services.api.fetchClient.POST('/v1/slot-offers/{id}/accept', {
      params: { path: { id: offerId }, ...idempotencyHeader(key) },
      body: {},
    }),
  );
  return result.ok ? { ok: true, lesson: result.data } : failure(result);
}

export async function startCheckout(
  services: AppServices,
  attempt: Attempt,
  body: CheckoutRequest,
): Promise<FlowResult<{ paymentId: string }>> {
  const result = await sendIdempotent(attempt, body, (key) =>
    services.api.fetchClient.POST('/v1/checkout', { params: idempotencyHeader(key), body }),
  );
  if (!result.ok) return failure(result);
  await openBrowserAsync(result.data.checkoutUrl);
  return { ok: true, paymentId: result.data.paymentId };
}

export async function signContract(
  services: AppServices,
  contractId: string,
  role: 'student' | 'guardian',
): Promise<FlowResult<{ status: SignContractResponse['status'] }>> {
  const result = await send(() =>
    services.api.fetchClient.POST('/v1/contracts/{id}/sign', {
      params: { path: { id: contractId } },
      body: { role },
    }),
  );
  return result.ok ? { ok: true, status: result.data.status } : failure(result);
}
