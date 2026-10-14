import type { LessonResponse } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import {
  CountCompletedLessonsQuery,
  GetLessonQuery,
  ListStudentIdsWithLessonsQuery,
} from '../../scheduling/index.js';

@Injectable()
export class SchedulingFacts {
  constructor(private readonly queryBus: QueryBus) {}

  studentIdsWithLessons(instructorMembershipId: string, since: Date): Promise<string[]> {
    return this.queryBus.execute(new ListStudentIdsWithLessonsQuery(instructorMembershipId, since));
  }

  completedLessons(studentId: string): Promise<number> {
    return this.queryBus.execute(new CountCompletedLessonsQuery(studentId));
  }

  async lessonOfStudent(lessonId: string, studentId: string): Promise<LessonResponse> {
    const lesson = await this.queryBus.execute(new GetLessonQuery(lessonId));
    if (lesson === null || lesson.studentId !== studentId) throw notFound();
    return lesson;
  }
}
