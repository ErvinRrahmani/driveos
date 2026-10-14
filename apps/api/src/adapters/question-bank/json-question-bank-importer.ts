import { readFile } from 'node:fs/promises';
import { type ImportQuestionPackRequest, importQuestionPackRequestSchema } from '@driveos/shared';
import type { z } from 'zod';
import {
  type ImportedQuestionPack,
  type QuestionBankImporter,
  QuestionPackInvalidError,
  type QuestionPackIssue,
} from './question-bank-importer.js';

export function packVersionNumber(version: string): number {
  const [major, minor] = version.split('.').map(Number);
  if (major === undefined || minor === undefined) throw new Error(`Bad pack version ${version}`);
  return major * 100 + minor;
}

function examIssues(pack: ImportQuestionPackRequest): QuestionPackIssue[] {
  const issues: QuestionPackIssue[] = [];
  const { exam, questions } = pack;
  if (exam.questions > questions.length) {
    issues.push({
      path: ['exam', 'questions'],
      message: `The exam needs ${exam.questions} questions, the pack has ${questions.length}`,
    });
  }
  const categories = Object.entries(exam.categories ?? {});
  for (const [category, count] of categories) {
    const available = questions.filter((q) => q.category === category).length;
    if (available < count) {
      issues.push({
        path: ['exam', 'categories', category],
        message: `The exam needs ${count} questions in this category, the pack has ${available}`,
      });
    }
  }
  const categoryTotal = categories.reduce((sum, [, count]) => sum + count, 0);
  if (categoryTotal > exam.questions) {
    issues.push({
      path: ['exam', 'categories'],
      message: `The category counts add up to ${categoryTotal}, more than the ${exam.questions} exam questions`,
    });
  }
  return issues;
}

function questionIssues(pack: ImportQuestionPackRequest): QuestionPackIssue[] {
  const issues: QuestionPackIssue[] = [];
  const seen = new Set<string>();
  pack.questions.forEach((question, index) => {
    if (question.correct.some((answer) => answer >= question.answers.length)) {
      issues.push({
        path: ['questions', index, 'correct'],
        message: `Correct answers must be indexes of the ${question.answers.length} answers`,
      });
    }
    if (new Set(question.correct).size !== question.correct.length) {
      issues.push({ path: ['questions', index, 'correct'], message: 'Correct answers repeat' });
    }
    if (seen.has(question.ref)) {
      issues.push({
        path: ['questions', index, 'ref'],
        message: `The ref ${question.ref} is used twice`,
      });
    }
    seen.add(question.ref);
    if (question.instantFail && pack.exam.rules !== 'error_points') {
      issues.push({
        path: ['questions', index, 'instantFail'],
        message: 'Instant-fail questions need error_points exam rules',
      });
    }
  });
  return issues;
}

function zodIssues(error: z.ZodError): QuestionPackIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map((part) => (typeof part === 'symbol' ? String(part) : part)),
    message: issue.message,
  }));
}

export class JsonQuestionBankImporter implements QuestionBankImporter {
  parse(source: unknown): ImportedQuestionPack {
    const parsed = importQuestionPackRequestSchema.safeParse(source);
    if (!parsed.success) throw new QuestionPackInvalidError(zodIssues(parsed.error));
    const pack = parsed.data;
    const issues = [...questionIssues(pack), ...examIssues(pack)];
    if (issues.length > 0) throw new QuestionPackInvalidError(issues);
    return {
      countryCode: pack.country,
      licenceClass: pack.licenceClass,
      language: pack.language,
      version: packVersionNumber(pack.version),
      exam: pack.exam,
      questions: pack.questions.map((question) => ({
        externalRef: question.ref,
        category: question.category,
        body: question.body,
        mediaKey: question.media,
        answers: question.answers,
        correct: question.correct,
        points: question.points,
        explanation: question.explanation,
        instantFail: question.instantFail ?? false,
      })),
    };
  }
}

export async function loadQuestionPackFile(
  importer: QuestionBankImporter,
  file: string,
): Promise<ImportedQuestionPack> {
  return importer.parse(JSON.parse(await readFile(file, 'utf8')));
}
