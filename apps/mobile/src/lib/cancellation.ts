const HOUR_MS = 3_600_000;

export function isLateCancel(start: string, now: number, windowHours: number): boolean {
  return Date.parse(start) - now < windowHours * HOUR_MS;
}

export function canCancel(lesson: { status: string; start: string }, now: number): boolean {
  return lesson.status === 'booked' && Date.parse(lesson.start) > now;
}
