import type { ExamRules } from '@driveos/shared';

export const QUESTION_BANK_IMPORTER = Symbol('QUESTION_BANK_IMPORTER');

export interface ImportedQuestion {
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

export interface ImportedQuestionPack {
  countryCode: string;
  licenceClass: string;
  language: string;
  version: number;
  exam: ExamRules;
  questions: ImportedQuestion[];
}

export interface QuestionPackIssue {
  path: (string | number)[];
  message: string;
}

export interface QuestionBankImporter {
  parse(source: unknown): ImportedQuestionPack;
}

export class QuestionPackInvalidError extends Error {
  constructor(readonly issues: QuestionPackIssue[]) {
    super(
      `Invalid question pack: ${issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
    this.name = 'QuestionPackInvalidError';
  }
}
