import type { InstructorPeriod } from './availability.js';
import { satisfiesMinGap } from './gap.js';
import type { Period } from './period.js';

const MINUTE = 60_000;

export const FREE_SLOT_STEP_MINUTES = 15;
export const FREE_SLOT_LIMIT = 500;

export interface VehicleSchedule {
  id: string;
  busy: readonly Period[];
}

export interface FreeSlotInput {
  windows: readonly InstructorPeriod[];
  instructorBusy: ReadonlyMap<string, readonly Period[]>;
  minutes: number;
  minGapMinutes: number;
  stepMinutes?: number;
  notBefore?: Date;
  vehicles?: readonly VehicleSchedule[];
  limit?: number;
}

export interface CandidateSlot extends InstructorPeriod {
  vehicleId: string | null;
}

export function listFreeSlots(input: FreeSlotInput): CandidateSlot[] {
  const step = (input.stepMinutes ?? FREE_SLOT_STEP_MINUTES) * MINUTE;
  const length = input.minutes * MINUTE;
  const notBefore = input.notBefore?.getTime() ?? Number.NEGATIVE_INFINITY;
  const slots: CandidateSlot[] = [];
  for (const window of input.windows) {
    const busy = input.instructorBusy.get(window.instructorMembershipId) ?? [];
    const first = Math.ceil(Math.max(window.start.getTime(), notBefore) / step) * step;
    for (let start = first; start + length <= window.end.getTime(); start += step) {
      const candidate = { start: new Date(start), end: new Date(start + length) };
      if (!satisfiesMinGap(candidate, busy, input.minGapMinutes)) continue;
      let vehicleId: string | null = null;
      if (input.vehicles) {
        const vehicle = input.vehicles.find((car) => satisfiesMinGap(candidate, car.busy, 0));
        if (!vehicle) continue;
        vehicleId = vehicle.id;
      }
      slots.push({
        instructorMembershipId: window.instructorMembershipId,
        vehicleId,
        ...candidate,
      });
    }
  }
  return slots
    .sort(
      (a, b) =>
        a.start.getTime() - b.start.getTime() ||
        a.instructorMembershipId.localeCompare(b.instructorMembershipId),
    )
    .slice(0, input.limit ?? FREE_SLOT_LIMIT);
}
