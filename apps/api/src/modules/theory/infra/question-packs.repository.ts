import { type ExamRules, examRulesSchema } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { and, count, desc, eq } from 'drizzle-orm';
import type { ImportedQuestionPack } from '../../../adapters/question-bank/question-bank-importer.js';
import { newId } from '../../../kernel/db/columns.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { questionPacks, questions } from './schema.js';

export interface QuestionPackKey {
  countryCode: string;
  licenceClass: string;
  language: string;
}

export interface QuestionPackRecord extends QuestionPackKey {
  id: string;
  version: number;
  exam: ExamRules;
  status: 'draft' | 'published';
  publishedAt: Date | null;
}

type PackRow = typeof questionPacks.$inferSelect;

const toRecord = (row: PackRow): QuestionPackRecord => ({
  id: row.id,
  countryCode: row.countryCode,
  licenceClass: row.licenceClass,
  language: row.language,
  version: row.version,
  exam: examRulesSchema.parse(row.examRules),
  status: row.status,
  publishedAt: row.publishedAt,
});

@Injectable()
export class QuestionPacksRepository {
  constructor(private readonly tenant: TenantContext) {}

  async insertDraft(pack: ImportedQuestionPack): Promise<string> {
    const id = newId();
    await this.tenant.tx.insert(questionPacks).values({
      id,
      countryCode: pack.countryCode,
      licenceClass: pack.licenceClass,
      language: pack.language,
      version: pack.version,
      examRules: pack.exam,
      status: 'draft',
    });
    await this.tenant.tx
      .insert(questions)
      .values(pack.questions.map((question) => ({ ...question, id: newId(), packId: id })));
    return id;
  }

  async find(id: string): Promise<QuestionPackRecord | null> {
    const [row] = await this.tenant.tx.select().from(questionPacks).where(eq(questionPacks.id, id));
    return row ? toRecord(row) : null;
  }

  async findForUpdate(id: string): Promise<QuestionPackRecord | null> {
    const [row] = await this.tenant.tx
      .select()
      .from(questionPacks)
      .where(eq(questionPacks.id, id))
      .for('update');
    return row ? toRecord(row) : null;
  }

  async markPublished(id: string, publishedAt: Date): Promise<void> {
    await this.tenant.tx
      .update(questionPacks)
      .set({ status: 'published', publishedAt })
      .where(eq(questionPacks.id, id));
  }

  async latestPublished(key: QuestionPackKey): Promise<QuestionPackRecord | null> {
    const [row] = await this.tenant.tx
      .select()
      .from(questionPacks)
      .where(
        and(
          eq(questionPacks.countryCode, key.countryCode),
          eq(questionPacks.licenceClass, key.licenceClass),
          eq(questionPacks.language, key.language),
          eq(questionPacks.status, 'published'),
        ),
      )
      .orderBy(desc(questionPacks.version))
      .limit(1);
    return row ? toRecord(row) : null;
  }

  async questionCount(packId: string): Promise<number> {
    const [row] = await this.tenant.tx
      .select({ total: count() })
      .from(questions)
      .where(eq(questions.packId, packId));
    return row?.total ?? 0;
  }

  async categories(packId: string): Promise<string[]> {
    const rows = await this.tenant.tx
      .selectDistinct({ category: questions.category })
      .from(questions)
      .where(eq(questions.packId, packId))
      .orderBy(questions.category);
    return rows.map((row) => row.category);
  }
}
