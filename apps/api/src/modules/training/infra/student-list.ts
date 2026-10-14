import type { ListStudentsQuery as ListStudentsParams, StudentListResponse } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { and, asc, eq, exists, gt, ilike, inArray, isNull, sql } from 'drizzle-orm';
import { idCursor, pageOf } from '../../../kernel/http/paging.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { lessonDates, type TrackedLessonStatus } from '../domain/lesson-dates.js';
import { People } from './people.js';
import { ProgressRecords } from './progress-records.js';
import { rmStudentLessons, rmStudentList, studentInstructors, students } from './schema.js';

export interface TrackedLessonInput {
  schoolId: string;
  lessonId: string;
  studentId: string;
  instructorMembershipId: string;
  start: string;
  end: string;
  status: TrackedLessonStatus;
}

const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

@Injectable()
export class StudentListRows {
  constructor(
    private readonly tenant: TenantContext,
    private readonly people: People,
    private readonly progress: ProgressRecords,
  ) {}

  async lockStudent(studentId: string): Promise<void> {
    await this.tenant.tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('rm_student_list'), hashtext(${studentId}))`,
    );
  }

  async refresh(studentId: string): Promise<boolean> {
    const [student] = await this.tenant.tx
      .select()
      .from(students)
      .where(eq(students.id, studentId));
    if (!student) return false;
    const [primary] = await this.tenant.tx
      .select({ membershipId: studentInstructors.instructorMembershipId })
      .from(studentInstructors)
      .where(
        and(
          eq(studentInstructors.studentId, studentId),
          eq(studentInstructors.isPrimary, true),
          isNull(studentInstructors.unassignedAt),
        ),
      );
    const primaryInstructorName = primary
      ? ((await this.people.staffNames()).get(primary.membershipId) ?? null)
      : null;
    const { progressPct } = await this.progress.summary(studentId, student.licenceClass);
    const fields = {
      fullName: student.fullName,
      licenceClass: student.licenceClass,
      status: student.status,
      primaryInstructorName,
      progressPct,
    };
    await this.tenant.tx
      .insert(rmStudentList)
      .values({ schoolId: student.schoolId, studentId, balanceMinutes: 0, ...fields })
      .onConflictDoUpdate({
        target: rmStudentList.studentId,
        set: { ...fields, updatedAt: sql`now()` },
      });
    return true;
  }

  async setBalance(studentId: string, balanceMinutes: number): Promise<void> {
    if (!(await this.refresh(studentId))) return;
    await this.tenant.tx
      .update(rmStudentList)
      .set({ balanceMinutes })
      .where(eq(rmStudentList.studentId, studentId));
  }

  async trackLesson(lesson: TrackedLessonInput): Promise<void> {
    const [previous] = await this.tenant.tx
      .select({ studentId: rmStudentLessons.studentId })
      .from(rmStudentLessons)
      .where(eq(rmStudentLessons.lessonId, lesson.lessonId));
    const fields = {
      studentId: lesson.studentId,
      instructorMembershipId: lesson.instructorMembershipId,
      startAt: new Date(lesson.start),
      endAt: new Date(lesson.end),
      status: lesson.status,
    };
    await this.tenant.tx
      .insert(rmStudentLessons)
      .values({ schoolId: lesson.schoolId, lessonId: lesson.lessonId, ...fields })
      .onConflictDoUpdate({ target: rmStudentLessons.lessonId, set: fields });
    await this.refreshLessonDates(lesson.studentId);
    if (previous && previous.studentId !== lesson.studentId) {
      await this.refreshLessonDates(previous.studentId);
    }
  }

  async lessons(studentId: string) {
    return this.tenant.tx
      .select()
      .from(rmStudentLessons)
      .where(eq(rmStudentLessons.studentId, studentId))
      .orderBy(asc(rmStudentLessons.startAt), asc(rmStudentLessons.lessonId));
  }

  async list(
    params: ListStudentsParams,
    visible: 'all' | ReadonlySet<string>,
  ): Promise<StudentListResponse> {
    const cursor = idCursor(params.cursor);
    if (visible !== 'all' && visible.size === 0) return { items: [], nextCursor: null };
    const instructorId = params.instructorId;
    const rows = await this.tenant.tx
      .select()
      .from(rmStudentList)
      .where(
        and(
          visible === 'all' ? undefined : inArray(rmStudentList.studentId, [...visible]),
          cursor ? gt(rmStudentList.studentId, cursor) : undefined,
          params.status ? eq(rmStudentList.status, params.status) : undefined,
          params.q ? ilike(rmStudentList.fullName, likePattern(params.q)) : undefined,
          instructorId
            ? exists(
                this.tenant.tx
                  .select({ one: studentInstructors.id })
                  .from(studentInstructors)
                  .where(
                    and(
                      eq(studentInstructors.studentId, rmStudentList.studentId),
                      eq(studentInstructors.instructorMembershipId, instructorId),
                      isNull(studentInstructors.unassignedAt),
                    ),
                  ),
              )
            : undefined,
        ),
      )
      .orderBy(asc(rmStudentList.studentId))
      .limit(params.limit + 1);
    const items = rows.map((row) => ({
      id: row.studentId,
      fullName: row.fullName,
      licenceClass: row.licenceClass,
      status: row.status as StudentListResponse['items'][number]['status'],
      primaryInstructorName: row.primaryInstructorName,
      balanceMinutes: row.balanceMinutes,
      nextLessonAt: row.nextLessonAt?.toISOString() ?? null,
      lastLessonAt: row.lastLessonAt?.toISOString() ?? null,
      progressPct: row.progressPct,
      updatedAt: row.updatedAt.toISOString(),
    }));
    return pageOf(items, params.limit, (item) => item.id);
  }

  private async refreshLessonDates(studentId: string): Promise<void> {
    if (!(await this.refresh(studentId))) return;
    const tracked = await this.lessons(studentId);
    const dates = lessonDates(
      tracked.map((row) => ({ start: row.startAt, status: row.status as TrackedLessonStatus })),
    );
    await this.tenant.tx
      .update(rmStudentList)
      .set(dates)
      .where(eq(rmStudentList.studentId, studentId));
  }
}
