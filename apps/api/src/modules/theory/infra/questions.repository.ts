import { Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { questions } from './schema.js';

export interface QuestionRecord {
  id: string;
  packId: string;
  externalRef: string;
  category: string;
  body: string;
  mediaKey: string | null;
  answers: string[];
  correct: number[];
  points: number;
  explanation: string;
  instantFail: boolean;
}

const bodySchema = z.string();
const answersSchema = z.array(z.string());
const correctSchema = z.array(z.number().int().nonnegative());

type QuestionRow = typeof questions.$inferSelect;

const toRecord = (row: QuestionRow): QuestionRecord => ({
  id: row.id,
  packId: row.packId,
  externalRef: row.externalRef,
  category: row.category,
  body: bodySchema.parse(row.body),
  mediaKey: row.mediaKey,
  answers: answersSchema.parse(row.answers),
  correct: correctSchema.parse(row.correct),
  points: row.points,
  explanation: row.explanation,
  instantFail: row.instantFail,
});

@Injectable()
export class QuestionsRepository {
  constructor(private readonly tenant: TenantContext) {}

  async byPack(packId: string): Promise<QuestionRecord[]> {
    const rows = await this.tenant.tx
      .select()
      .from(questions)
      .where(eq(questions.packId, packId))
      .orderBy(asc(questions.externalRef));
    return rows.map(toRecord);
  }

  async byIds(ids: readonly string[]): Promise<QuestionRecord[]> {
    if (ids.length === 0) return [];
    const rows = await this.tenant.tx
      .select()
      .from(questions)
      .where(inArray(questions.id, [...ids]));
    const byId = new Map(rows.map((row) => [row.id, toRecord(row)]));
    return ids.flatMap((id) => {
      const question = byId.get(id);
      return question ? [question] : [];
    });
  }
}
