import { type ActingRole, isInsideWindow, isStaffRole } from './cancellation.js';

export interface MoveInput {
  now: Date;
  originalStart: Date;
  windowHours: number;
  byRole: ActingRole;
}

export function moveInsideWindow({ now, originalStart, windowHours, byRole }: MoveInput): {
  lateCancellation: boolean;
} {
  if (isStaffRole(byRole)) return { lateCancellation: false };
  return { lateCancellation: isInsideWindow({ now, lessonStart: originalStart, windowHours }) };
}
