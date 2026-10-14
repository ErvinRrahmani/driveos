import type { Period } from './period.js';
import { isoWeekday, localDateOf, localMinuteOfDay } from './time-zone.js';

const MINUTE = 60_000;
export const SLOT_OFFER_MIN_LEAD_MS = 2 * 60 * MINUTE;

export interface PreferredWindow {
  weekday: number;
  start: string;
  end: string;
}

export interface SlotForAudience {
  lessonTypeId: string;
  licenceClass: string;
  creditMinutes: number;
  instructorMembershipId: string;
  period: Period;
  area: string | null;
}

export interface AudienceCandidate {
  studentId: string;
  status: string;
  licenceClass: string;
  area: string | null;
  allowedInstructorMembershipIds: readonly string[];
  balance: number;
}

export interface WaitingListCandidate {
  id: string;
  studentId: string;
  lessonTypeId: string;
  preferredWindows: readonly PreferredWindow[];
  createdAt: Date;
}

export interface AudienceInput {
  slot: SlotForAudience;
  zone: string;
  waitingList: readonly WaitingListCandidate[];
  candidates: readonly AudienceCandidate[];
  studentIds?: readonly string[];
  excludeStudentIds?: readonly string[];
}

export type AudienceTier = 'explicit' | 'waiting_list' | 'area' | 'none';

export interface Audience {
  tier: AudienceTier;
  studentIds: string[];
}

export function offerExpiresAt(now: Date, start: Date, ttlMinutes: number): Date {
  return new Date(
    Math.min(now.getTime() + ttlMinutes * MINUTE, start.getTime() - SLOT_OFFER_MIN_LEAD_MS),
  );
}

function minuteOf(time: string): number {
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  return hour * 60 + minute;
}

export function matchesPreferredWindows(
  period: Period,
  windows: readonly PreferredWindow[],
  zone: string,
): boolean {
  const day = localDateOf(period.start, zone);
  if (localDateOf(new Date(period.end.getTime() - 1), zone) !== day) return false;
  const weekday = isoWeekday(day);
  const start = localMinuteOfDay(period.start, zone);
  const end = start + Math.round((period.end.getTime() - period.start.getTime()) / MINUTE);
  return windows.some(
    (window) =>
      window.weekday === weekday && minuteOf(window.start) <= start && end <= minuteOf(window.end),
  );
}

export function normalizeArea(area: string | null): string | null {
  const normalized = area?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function isEligible(candidate: AudienceCandidate, slot: SlotForAudience): boolean {
  const allowed = candidate.allowedInstructorMembershipIds;
  return (
    candidate.status === 'active' &&
    candidate.licenceClass === slot.licenceClass &&
    (allowed.length === 0 || allowed.includes(slot.instructorMembershipId)) &&
    candidate.balance >= slot.creditMinutes
  );
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

export function selectAudience(input: AudienceInput): Audience {
  const { slot } = input;
  const excluded = new Set(input.excludeStudentIds ?? []);
  const byId = new Map(input.candidates.map((candidate) => [candidate.studentId, candidate]));
  const eligible = (studentId: string): boolean => {
    const candidate = byId.get(studentId);
    return !excluded.has(studentId) && candidate !== undefined && isEligible(candidate, slot);
  };

  if (input.studentIds) {
    return { tier: 'explicit', studentIds: unique(input.studentIds).filter(eligible) };
  }

  const waiting = [...input.waitingList]
    .filter(
      (entry) =>
        entry.lessonTypeId === slot.lessonTypeId &&
        matchesPreferredWindows(slot.period, entry.preferredWindows, input.zone),
    )
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const fromWaitingList = unique(waiting.map((entry) => entry.studentId)).filter(eligible);
  if (fromWaitingList.length > 0) return { tier: 'waiting_list', studentIds: fromWaitingList };

  const area = normalizeArea(slot.area);
  if (!area) return { tier: 'none', studentIds: [] };
  const fromArea = unique(
    input.candidates
      .filter((candidate) => normalizeArea(candidate.area) === area)
      .map((candidate) => candidate.studentId),
  ).filter(eligible);
  return fromArea.length > 0
    ? { tier: 'area', studentIds: fromArea }
    : { tier: 'none', studentIds: [] };
}
