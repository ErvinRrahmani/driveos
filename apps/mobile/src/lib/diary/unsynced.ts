import type { DiaryCounts } from './view';

export interface UnsyncedWarning {
  count: number;
}

export function unsyncedWarning({ pending, conflicts }: DiaryCounts): UnsyncedWarning | null {
  const count = pending + conflicts;
  return count > 0 ? { count } : null;
}
