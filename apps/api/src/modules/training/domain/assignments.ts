export interface CurrentAssignment {
  assignmentId: string;
  instructorMembershipId: string;
  isPrimary: boolean;
}

export interface DesiredAssignment {
  instructorMembershipId: string;
  isPrimary: boolean;
}

export interface AssignmentPlan {
  unassign: CurrentAssignment[];
  demote: CurrentAssignment[];
  promote: CurrentAssignment[];
  assign: DesiredAssignment[];
}

export function hasOnePrimary(desired: readonly DesiredAssignment[]): boolean {
  return desired.length === 0 || desired.filter((row) => row.isPrimary).length === 1;
}

export function planAssignments(
  current: readonly CurrentAssignment[],
  desired: readonly DesiredAssignment[],
): AssignmentPlan {
  const wanted = new Map(desired.map((row) => [row.instructorMembershipId, row]));
  const existing = new Set(current.map((row) => row.instructorMembershipId));
  const kept = current.filter((row) => wanted.has(row.instructorMembershipId));
  const primaryOf = (row: CurrentAssignment) => wanted.get(row.instructorMembershipId)?.isPrimary;
  return {
    unassign: current.filter((row) => !wanted.has(row.instructorMembershipId)),
    demote: kept.filter((row) => row.isPrimary && primaryOf(row) === false),
    promote: kept.filter((row) => !row.isPrimary && primaryOf(row) === true),
    assign: desired.filter((row) => !existing.has(row.instructorMembershipId)),
  };
}
