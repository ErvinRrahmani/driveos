import {
  PROGRESS_LEVEL_MAX,
  type ProgressEntry,
  type StudentProgressResponse,
  type SyllabusItem,
  type TestAttempt,
} from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { asc, desc, eq } from 'drizzle-orm';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { type ProgressMark, type ProgressSummary, summarizeProgress } from '../domain/progress.js';
import { People } from './people.js';
import { progressEntries, rmStudentLessons, syllabusItems, testAttempts } from './schema.js';
import type { StudentRow } from './student-records.js';

interface EntryRow {
  id: string;
  lessonId: string;
  syllabusItemId: string;
  level: number;
  note: string;
  version: number;
  recordedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  lessonStart: Date | null;
  lessonInstructor: string | null;
}

@Injectable()
export class ProgressRecords {
  constructor(
    private readonly tenant: TenantContext,
    private readonly people: People,
  ) {}

  async syllabus(licenceClass?: string): Promise<SyllabusItem[]> {
    const rows = await this.tenant.tx
      .select()
      .from(syllabusItems)
      .where(licenceClass ? eq(syllabusItems.licenceClass, licenceClass) : undefined)
      .orderBy(
        asc(syllabusItems.licenceClass),
        asc(syllabusItems.sortOrder),
        asc(syllabusItems.code),
      );
    return rows.map((row) => ({
      id: row.id,
      licenceClass: row.licenceClass,
      code: row.code,
      title: row.title,
      sortOrder: row.sortOrder,
    }));
  }

  async summary(studentId: string, licenceClass: string): Promise<ProgressSummary> {
    return this.summarize(licenceClass, await this.entryRows(studentId));
  }

  async progress(student: StudentRow): Promise<StudentProgressResponse> {
    const rows = await this.entryRows(student.id);
    const summary = await this.summarize(student.licenceClass, rows);
    const names = await this.people.staffNames();
    return {
      studentId: student.id,
      licenceClass: student.licenceClass,
      progressPct: summary.progressPct,
      syllabus: summary.items.map((item) => ({
        ...item,
        updatedAt: item.updatedAt?.toISOString() ?? null,
      })),
      entries: rows.map((row): ProgressEntry => {
        const instructor = row.lessonInstructor ?? row.recordedBy;
        return {
          id: row.id,
          lessonId: row.lessonId,
          lessonStart: (row.lessonStart ?? row.createdAt).toISOString(),
          instructorName: instructor ? (names.get(instructor) ?? '') : '',
          syllabusItemId: row.syllabusItemId,
          level: row.level,
          note: row.note,
          version: row.version,
        };
      }),
      testAttempts: await this.testAttempts(student.id),
    };
  }

  async testAttempts(studentId: string): Promise<TestAttempt[]> {
    const rows = await this.tenant.tx
      .select()
      .from(testAttempts)
      .where(eq(testAttempts.studentId, studentId))
      .orderBy(desc(testAttempts.takenOn), desc(testAttempts.id));
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      takenOn: row.takenOn,
      result: row.result,
      notes: row.notes,
    }));
  }

  private async summarize(licenceClass: string, rows: EntryRow[]): Promise<ProgressSummary> {
    const items = await this.tenant.tx
      .select()
      .from(syllabusItems)
      .where(eq(syllabusItems.licenceClass, licenceClass));
    const marks = rows.map((row): ProgressMark => ({
      syllabusItemId: row.syllabusItemId,
      lessonId: row.lessonId,
      level: row.level,
      note: row.note,
      at: row.lessonStart ?? row.createdAt,
      updatedAt: row.updatedAt,
    }));
    return summarizeProgress(items, marks, PROGRESS_LEVEL_MAX);
  }

  private async entryRows(studentId: string): Promise<EntryRow[]> {
    const rows = await this.tenant.tx
      .select({
        id: progressEntries.id,
        lessonId: progressEntries.lessonId,
        syllabusItemId: progressEntries.syllabusItemId,
        level: progressEntries.level,
        note: progressEntries.note,
        version: progressEntries.version,
        recordedBy: progressEntries.recordedByMembershipId,
        createdAt: progressEntries.createdAt,
        updatedAt: progressEntries.updatedAt,
        lessonStart: rmStudentLessons.startAt,
        lessonInstructor: rmStudentLessons.instructorMembershipId,
        sortOrder: syllabusItems.sortOrder,
      })
      .from(progressEntries)
      .innerJoin(syllabusItems, eq(syllabusItems.id, progressEntries.syllabusItemId))
      .leftJoin(rmStudentLessons, eq(rmStudentLessons.lessonId, progressEntries.lessonId))
      .where(eq(progressEntries.studentId, studentId));
    return rows
      .map(({ sortOrder, ...row }) => ({ row, sortOrder }))
      .sort(
        (a, b) =>
          (a.row.lessonStart ?? a.row.createdAt).getTime() -
            (b.row.lessonStart ?? b.row.createdAt).getTime() || a.sortOrder - b.sortOrder,
      )
      .map(({ row }) => row);
  }
}
