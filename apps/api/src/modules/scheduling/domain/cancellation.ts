export type ActingRole = 'owner' | 'office' | 'instructor' | 'student' | 'parent';

const STAFF: ReadonlySet<ActingRole> = new Set(['owner', 'office', 'instructor']);

export function isStaffRole(role: ActingRole): boolean {
  return STAFF.has(role);
}

export interface WindowCheck {
  now: Date;
  lessonStart: Date;
  windowHours: number;
}

export function isInsideWindow({ now, lessonStart, windowHours }: WindowCheck): boolean {
  return lessonStart.getTime() - now.getTime() < windowHours * 3_600_000;
}

export interface CancellationInput extends WindowCheck {
  byRole: ActingRole;
  override: boolean;
}

export type CancellationRefusal = 'override_not_allowed' | 'override_outside_window';

export type CancellationDecision =
  { late: boolean; restore: boolean; requiresAudit: boolean } | { refused: CancellationRefusal };

const MAY_KEEP_CREDIT: ReadonlySet<ActingRole> = new Set(['owner', 'office']);

export function cancellationDecision(input: CancellationInput): CancellationDecision {
  const inside = isInsideWindow(input);
  if (input.override) {
    if (!MAY_KEEP_CREDIT.has(input.byRole)) return { refused: 'override_not_allowed' };
    if (!inside) return { refused: 'override_outside_window' };
    return { late: true, restore: false, requiresAudit: true };
  }
  if (isStaffRole(input.byRole)) return { late: false, restore: true, requiresAudit: false };
  return { late: inside, restore: !inside, requiresAudit: false };
}
