import { useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useMemo, useState } from 'react';
import { createAttempt } from './flow';
import { PERSIST } from './query';
import { useServices } from './session';
import { useStudentScope } from './student-scope';

const DAY_MS = 86_400_000;
export const CALENDAR_DAYS_BACK = 90;
export const CALENDAR_DAYS_AHEAD = 180;
export const BOOKING_DAYS_AHEAD = 14;

export function useDayWindow(daysBack: number, daysAhead: number) {
  const [today] = useState(() => Math.floor(Date.now() / DAY_MS) * DAY_MS);
  return useMemo(
    () => ({
      from: new Date(today - daysBack * DAY_MS).toISOString(),
      to: new Date(today + (daysAhead + 1) * DAY_MS).toISOString(),
    }),
    [today, daysBack, daysAhead],
  );
}

export function useAttempt() {
  const [attempt] = useState(() => createAttempt(randomUUID));
  return attempt;
}

export function useShop() {
  const { api } = useServices();
  const scope = useStudentScope();
  return api.$api.useQuery(
    'get',
    '/v1/shop',
    scope.self ? {} : { params: { query: { studentId: scope.studentId ?? '' } } },
    { enabled: scope.self || scope.studentId !== undefined },
  );
}

export function useStudentId(): string | undefined {
  const scope = useStudentScope();
  const shopStudentId = useShop().data?.studentId;
  return scope.self ? shopStudentId : scope.studentId;
}

export function useSchool() {
  const { api } = useServices();
  return api.$api.useQuery('get', '/v1/school', {}, { meta: PERSIST });
}

export function useSchoolSettings() {
  const { api } = useServices();
  return api.$api.useQuery('get', '/v1/school/settings', {}, { meta: PERSIST });
}

export function useTimeZone(): string | undefined {
  return useSchool().data?.timeZone;
}

export function useTheoryStats() {
  const { api } = useServices();
  return api.$api.useQuery('get', '/v1/theory/stats', {}, { meta: PERSIST });
}

export function useStudentLessons(studentId: string | undefined) {
  const { api } = useServices();
  const window = useDayWindow(CALENDAR_DAYS_BACK, CALENDAR_DAYS_AHEAD);
  return api.$api.useQuery(
    'get',
    '/v1/calendar',
    { params: { query: { ...window, studentId: studentId ?? '', limit: 200 } } },
    { enabled: studentId !== undefined, meta: PERSIST },
  );
}

export function useBalance(studentId: string | undefined) {
  const { api } = useServices();
  return api.$api.useQuery(
    'get',
    '/v1/students/{id}/balance',
    { params: { path: { id: studentId ?? '' } } },
    { enabled: studentId !== undefined },
  );
}

export function useLedger(studentId: string | undefined) {
  const { api } = useServices();
  return api.$api.useQuery(
    'get',
    '/v1/students/{id}/ledger',
    { params: { path: { id: studentId ?? '' }, query: { limit: 50 } } },
    { enabled: studentId !== undefined },
  );
}

export function useInvoices(studentId: string | undefined) {
  const { api } = useServices();
  return api.$api.useQuery(
    'get',
    '/v1/invoices',
    { params: { query: { studentId: studentId ?? '', limit: 50 } } },
    { enabled: studentId !== undefined, meta: PERSIST },
  );
}

export function useProgress(studentId: string | undefined) {
  const { api } = useServices();
  return api.$api.useQuery(
    'get',
    '/v1/students/{id}/progress',
    { params: { path: { id: studentId ?? '' } } },
    { enabled: studentId !== undefined, meta: PERSIST },
  );
}

export function useDocuments(studentId: string | undefined) {
  const { api } = useServices();
  return api.$api.useQuery(
    'get',
    '/v1/documents',
    { params: { query: { ownerStudentId: studentId ?? '', limit: 50 } } },
    { enabled: studentId !== undefined, meta: PERSIST },
  );
}

export function useOpenSlotOffers() {
  const { api } = useServices();
  return api.$api.useQuery('get', '/v1/slot-offers', {
    params: { query: { status: 'open', limit: 50 } },
  });
}

export function useLessonTypes() {
  const { api } = useServices();
  return api.$api.useQuery(
    'get',
    '/v1/lesson-types',
    { params: { query: { active: 'true', limit: 100 } } },
    { meta: PERSIST },
  );
}

export function useConversations() {
  const { api } = useServices();
  return api.$api.useQuery('get', '/v1/conversations', { params: { query: { limit: 50 } } });
}

export function useMessages(conversationId: string) {
  const { api } = useServices();
  return api.$api.useQuery(
    'get',
    '/v1/conversations/{id}/messages',
    { params: { path: { id: conversationId }, query: { limit: 100 } } },
    { refetchInterval: 15_000 },
  );
}

export const MONEY_QUERIES = [
  '/v1/shop',
  '/v1/students/{id}/balance',
  '/v1/students/{id}/ledger',
  '/v1/invoices',
  '/v1/theory/stats',
] as const;

export const LESSON_QUERIES = [
  '/v1/calendar',
  '/v1/calendar/free-slots',
  '/v1/slot-offers',
  '/v1/shop',
  '/v1/students/{id}/balance',
  '/v1/students/{id}/ledger',
] as const;

export function useInvalidate() {
  const queryClient = useQueryClient();
  return (paths: readonly string[]) =>
    Promise.all(paths.map((path) => queryClient.invalidateQueries({ queryKey: ['get', path] })));
}

export function useDisplayZone(): string {
  return useTimeZone() ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}
