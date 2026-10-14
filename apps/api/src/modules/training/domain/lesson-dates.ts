export type TrackedLessonStatus = 'booked' | 'completed' | 'cancelled' | 'no_show';

export interface TrackedLesson {
  start: Date;
  status: TrackedLessonStatus;
}

export interface LessonDates {
  nextLessonAt: Date | null;
  lastLessonAt: Date | null;
}

export function lessonDates(lessons: readonly TrackedLesson[]): LessonDates {
  let nextLessonAt: Date | null = null;
  let lastLessonAt: Date | null = null;
  for (const lesson of lessons) {
    if (lesson.status === 'booked' && (nextLessonAt === null || lesson.start < nextLessonAt)) {
      nextLessonAt = lesson.start;
    }
    if (lesson.status === 'completed' && (lastLessonAt === null || lesson.start > lastLessonAt)) {
      lastLessonAt = lesson.start;
    }
  }
  return { nextLessonAt, lastLessonAt };
}
