import { describe, expect, it } from 'vitest';
import { listFreeSlots } from '../../../src/modules/scheduling/domain/free-slots.js';

const INGO = 'ingo';
const INA = 'ina';
const at = (time: string) => new Date(`2026-10-13T${time}:00.000Z`);
const window = (instructorMembershipId: string, start: string, end: string) => ({
  instructorMembershipId,
  start: at(start),
  end: at(end),
});
const times = (slots: { start: Date; end: Date }[]) =>
  slots.map(
    (slot) => `${slot.start.toISOString().slice(11, 16)}-${slot.end.toISOString().slice(11, 16)}`,
  );

describe('listFreeSlots', () => {
  it('steps through a window every 15 minutes for the lesson length', () => {
    const slots = listFreeSlots({
      windows: [window(INGO, '08:00', '09:30')],
      instructorBusy: new Map(),
      minutes: 60,
      minGapMinutes: 0,
    });
    expect(times(slots)).toEqual(['08:00-09:00', '08:15-09:15', '08:30-09:30']);
    expect(slots[0]).toMatchObject({ instructorMembershipId: INGO, vehicleId: null });
  });

  it('aligns the first start to the 15-minute grid', () => {
    const slots = listFreeSlots({
      windows: [window(INGO, '08:10', '09:30')],
      instructorBusy: new Map(),
      minutes: 60,
      minGapMinutes: 0,
    });
    expect(times(slots)).toEqual(['08:15-09:15', '08:30-09:30']);
  });

  it('skips slots overlapping a busy period of the instructor', () => {
    const slots = listFreeSlots({
      windows: [window(INGO, '08:00', '11:00')],
      instructorBusy: new Map([[INGO, [{ start: at('09:00'), end: at('10:00') }]]]),
      minutes: 60,
      minGapMinutes: 0,
    });
    expect(times(slots)).toEqual(['08:00-09:00', '10:00-11:00']);
  });

  it('keeps min_gap_minutes away from busy periods', () => {
    const slots = listFreeSlots({
      windows: [window(INGO, '08:00', '11:30')],
      instructorBusy: new Map([[INGO, [{ start: at('09:30'), end: at('10:00') }]]]),
      minutes: 60,
      minGapMinutes: 15,
    });
    expect(times(slots)).toEqual(['08:00-09:00', '08:15-09:15', '10:15-11:15', '10:30-11:30']);
  });

  it('a busy period of another instructor does not block', () => {
    const slots = listFreeSlots({
      windows: [window(INGO, '08:00', '09:00'), window(INA, '08:00', '09:00')],
      instructorBusy: new Map([[INA, [{ start: at('08:00'), end: at('09:00') }]]]),
      minutes: 60,
      minGapMinutes: 0,
    });
    expect(slots.map((slot) => slot.instructorMembershipId)).toEqual([INGO]);
  });

  it('pairs each slot with the first vehicle that is free and drops slots without one', () => {
    const slots = listFreeSlots({
      windows: [window(INGO, '08:00', '11:00')],
      instructorBusy: new Map(),
      minutes: 60,
      minGapMinutes: 0,
      stepMinutes: 60,
      vehicles: [
        { id: 'car-1', busy: [{ start: at('08:00'), end: at('10:00') }] },
        { id: 'car-2', busy: [{ start: at('09:00'), end: at('10:00') }] },
      ],
    });
    expect(slots.map((slot) => [times([slot])[0], slot.vehicleId])).toEqual([
      ['08:00-09:00', 'car-2'],
      ['10:00-11:00', 'car-1'],
    ]);
  });

  it('drops slots that start before notBefore', () => {
    const slots = listFreeSlots({
      windows: [window(INGO, '08:00', '10:00')],
      instructorBusy: new Map(),
      minutes: 60,
      minGapMinutes: 0,
      stepMinutes: 30,
      notBefore: at('08:20'),
    });
    expect(times(slots)).toEqual(['08:30-09:30', '09:00-10:00']);
  });

  it('sorts by start then instructor and caps the result', () => {
    const slots = listFreeSlots({
      windows: [window(INGO, '08:00', '10:00'), window(INA, '08:00', '10:00')],
      instructorBusy: new Map(),
      minutes: 60,
      minGapMinutes: 0,
      limit: 3,
    });
    expect(slots.map((slot) => [times([slot])[0], slot.instructorMembershipId])).toEqual([
      ['08:00-09:00', INA],
      ['08:00-09:00', INGO],
      ['08:15-09:15', INA],
    ]);
  });
});
