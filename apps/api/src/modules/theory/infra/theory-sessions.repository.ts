import type { TheorySessionMode } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, isNotNull, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { newId } from '../../../kernel/db/columns.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { AnswerFact } from '../domain/theory-sessions.js';
import { questions, theoryAnswers, theorySessions } from './schema.js';

export interface TheorySessionRecord {
  id: string;
  studentId: string;
  packId: string;
  mode: TheorySessionMode;
  questionIds: string[];
  startedAt: Date;
  deadlineAt: Date | null;
  finishedAt: Date | null;
  score: number | null;
  maxScore: number | null;
  passed: boolean | null;
}

export interface NewTheorySession {
  studentId: string;
  packId: string;
  mode: TheorySessionMode;
  questionIds: string[];
  startedAt: Date;
  deadlineAt: Date | null;
}

export interface TheoryAnswerRecord {
  questionId: string;
  given: number[];
  correct: boolean;
  answeredAt: Date;
}

export interface SessionScore {
  finishedAt: Date;
  score: number;
  maxScore: number;
  passed: boolean | null;
}

export interface MockSummary {
  taken: number;
  passed: number;
  last: { score: number; maxScore: number } | null;
}

const givenSchema = z.array(z.number().int().nonnegative());

type SessionRow = typeof theorySessions.$inferSelect;

const toSession = (row: SessionRow): TheorySessionRecord => ({
  id: row.id,
  studentId: row.studentId,
  packId: row.packId,
  mode: row.mode,
  questionIds: row.questionIds,
  startedAt: row.startedAt,
  deadlineAt: row.deadlineAt,
  finishedAt: row.finishedAt,
  score: row.score,
  maxScore: row.maxScore,
  passed: row.passed,
});

@Injectable()
export class TheorySessionsRepository {
  constructor(private readonly tenant: TenantContext) {}

  private get schoolId(): string {
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('The theory module needs a school in the tenant context');
    return schoolId;
  }

  async lockStudent(studentId: string): Promise<void> {
    await this.tenant.tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('theory_sessions.student'), hashtext(${studentId}))`,
    );
  }

  async insert(session: NewTheorySession): Promise<TheorySessionRecord> {
    const [row] = await this.tenant.tx
      .insert(theorySessions)
      .values({ ...session, id: newId(), schoolId: this.schoolId })
      .returning();
    if (!row) throw new Error('theory session insert returned no row');
    return toSession(row);
  }

  async findOwned(
    id: string,
    studentId: string,
    options: { forUpdate?: boolean } = {},
  ): Promise<TheorySessionRecord | null> {
    const query = this.tenant.tx
      .select()
      .from(theorySessions)
      .where(and(eq(theorySessions.id, id), eq(theorySessions.studentId, studentId)));
    const [row] = options.forUpdate ? await query.for('update') : await query;
    return row ? toSession(row) : null;
  }

  async countStartedSince(
    studentId: string,
    mode: TheorySessionMode,
    since: Date,
  ): Promise<number> {
    const [row] = await this.tenant.tx
      .select({ total: count() })
      .from(theorySessions)
      .where(
        and(
          eq(theorySessions.studentId, studentId),
          eq(theorySessions.mode, mode),
          gte(theorySessions.startedAt, since),
        ),
      );
    return row?.total ?? 0;
  }

  async answers(sessionId: string): Promise<TheoryAnswerRecord[]> {
    const rows = await this.tenant.tx
      .select({
        questionId: theoryAnswers.questionId,
        given: theoryAnswers.given,
        correct: theoryAnswers.correct,
        answeredAt: theoryAnswers.answeredAt,
      })
      .from(theoryAnswers)
      .where(eq(theoryAnswers.sessionId, sessionId))
      .orderBy(asc(theoryAnswers.answeredAt));
    return rows.map((row) => ({ ...row, given: givenSchema.parse(row.given) }));
  }

  async upsertAnswer(sessionId: string, answer: TheoryAnswerRecord): Promise<void> {
    await this.tenant.tx
      .insert(theoryAnswers)
      .values({ ...answer, id: newId(), schoolId: this.schoolId, sessionId })
      .onConflictDoUpdate({
        target: [theoryAnswers.sessionId, theoryAnswers.questionId],
        set: {
          given: answer.given,
          correct: answer.correct,
          answeredAt: answer.answeredAt,
          updatedAt: answer.answeredAt,
        },
      });
  }

  async finish(id: string, result: SessionScore): Promise<void> {
    await this.tenant.tx.update(theorySessions).set(result).where(eq(theorySessions.id, id));
  }

  async history(studentId: string): Promise<AnswerFact[]> {
    const rows = await this.tenant.tx
      .select({
        externalRef: questions.externalRef,
        given: theoryAnswers.given,
        correct: theoryAnswers.correct,
        answeredAt: theoryAnswers.answeredAt,
      })
      .from(theoryAnswers)
      .innerJoin(theorySessions, eq(theorySessions.id, theoryAnswers.sessionId))
      .innerJoin(questions, eq(questions.id, theoryAnswers.questionId))
      .where(
        and(
          eq(theorySessions.studentId, studentId),
          or(ne(theorySessions.mode, 'mock'), isNotNull(theorySessions.finishedAt)),
        ),
      )
      .orderBy(asc(theoryAnswers.answeredAt), asc(theoryAnswers.id));
    return rows.map((row) => ({ ...row, given: givenSchema.parse(row.given) }));
  }

  async mockSummary(studentId: string): Promise<MockSummary> {
    const rows = await this.tenant.tx
      .select({
        score: theorySessions.score,
        maxScore: theorySessions.maxScore,
        passed: theorySessions.passed,
      })
      .from(theorySessions)
      .where(
        and(
          eq(theorySessions.studentId, studentId),
          eq(theorySessions.mode, 'mock'),
          isNotNull(theorySessions.finishedAt),
        ),
      )
      .orderBy(desc(theorySessions.finishedAt));
    const [last] = rows;
    return {
      taken: rows.length,
      passed: rows.filter((row) => row.passed === true).length,
      last: last ? { score: last.score ?? 0, maxScore: last.maxScore ?? 0 } : null,
    };
  }
}
