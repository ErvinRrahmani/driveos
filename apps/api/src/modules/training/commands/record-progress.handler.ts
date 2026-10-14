import { ProgressRecorded } from '@driveos/shared';
import { and, inArray, sql } from 'drizzle-orm';
import {
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { invalidField } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { StudentStream } from '../events/student-stream.js';
import { SchedulingFacts } from '../infra/scheduling-facts.js';
import { progressEntries, syllabusItems } from '../infra/schema.js';
import { StudentAccess } from '../infra/student-access.js';
import { StudentListRows } from '../infra/student-list.js';
import { StudentRecords } from '../infra/student-records.js';
import { studentNotActive } from '../infra/training-errors.js';
import { type RecordedProgress, RecordProgressCommand } from './record-progress.command.js';

@CommandHandler(RecordProgressCommand)
export class RecordProgressHandler implements ICommandHandler<
  RecordProgressCommand,
  RecordedProgress
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly access: StudentAccess,
    private readonly records: StudentRecords,
    private readonly scheduling: SchedulingFacts,
    private readonly list: StudentListRows,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ actor, input }: RecordProgressCommand): Promise<RecordedProgress> {
    const { lessonId, studentId, entries } = input;
    await this.access.requireTeaching(actor, studentId);
    const student = await this.records.lock(studentId);
    if (student.status === 'anonymized') throw studentNotActive();
    if (entries.length === 0) return { entries: [] };
    await this.checkSyllabus(entries.map((entry) => entry.syllabusItemId));
    const { instructorMembershipId } = await this.scheduling.lessonOfStudent(lessonId, studentId);

    const saved: RecordedProgress['entries'] = [];
    for (const entry of entries) {
      const [row] = await this.tenant.tx
        .insert(progressEntries)
        .values({
          ...(entry.id ? { id: entry.id } : {}),
          schoolId: student.schoolId,
          lessonId,
          studentId,
          syllabusItemId: entry.syllabusItemId,
          level: entry.level,
          note: entry.note,
          recordedByMembershipId: actor.membershipId,
          version: 1,
        })
        .onConflictDoUpdate({
          target: [
            progressEntries.lessonId,
            progressEntries.studentId,
            progressEntries.syllabusItemId,
          ],
          set: {
            level: entry.level,
            note: entry.note,
            recordedByMembershipId: actor.membershipId,
            version: sql`${progressEntries.version} + 1`,
            updatedAt: sql`now()`,
          },
        })
        .returning({ id: progressEntries.id, version: progressEntries.version });
      if (row) saved.push(row);
    }
    const stream = new StudentStream(studentId, student.version);
    stream.add(ProgressRecorded, {
      lessonId,
      studentId,
      instructorMembershipId,
      entries: saved.map((row, index) => ({
        progressEntryId: row.id,
        syllabusItemId: entries[index]?.syllabusItemId as string,
        level: entries[index]?.level as number,
        version: row.version,
      })),
    });
    await this.records.setVersion(studentId, stream.version);
    await this.publisher.append(stream.events);
    await this.list.refresh(studentId);
    return { entries: saved };
  }

  private async checkSyllabus(ids: string[]): Promise<void> {
    if (new Set(ids).size !== ids.length) {
      throw invalidField(['entries'], 'Each syllabus item once');
    }
    const found = await this.tenant.tx
      .select({ id: syllabusItems.id })
      .from(syllabusItems)
      .where(and(inArray(syllabusItems.id, ids)));
    const known = new Set(found.map((row) => row.id));
    const missing = ids.findIndex((id) => !known.has(id));
    if (missing >= 0) {
      throw invalidField(['entries', missing, 'syllabusItemId'], 'Unknown syllabus item');
    }
  }
}
