import { describe, expect, it } from 'vitest';
import { lessonDates } from '../../../src/modules/training/domain/lesson-dates.js';

const at = (day: number) => new Date(Date.UTC(2026, 9, day, 9));

describe('lessonDates', () => {
  it('is empty without lessons', () => {
    expect(lessonDates([])).toEqual({ nextLessonAt: null, lastLessonAt: null });
  });

  it('takes the earliest booked lesson as next and the latest completed lesson as last', () => {
    expect(
      lessonDates([
        { start: at(20), status: 'booked' },
        { start: at(12), status: 'booked' },
        { start: at(3), status: 'completed' },
        { start: at(7), status: 'completed' },
        { start: at(10), status: 'cancelled' },
        { start: at(11), status: 'no_show' },
      ]),
    ).toEqual({ nextLessonAt: at(12), lastLessonAt: at(7) });
  });

  it('ignores cancelled and no-show lessons for both dates', () => {
    expect(
      lessonDates([
        { start: at(1), status: 'cancelled' },
        { start: at(2), status: 'no_show' },
      ]),
    ).toEqual({ nextLessonAt: null, lastLessonAt: null });
  });
});
