import { z } from 'zod';
import {
  countryCodeSchema,
  dateTimeSchema,
  licenceClassSchema,
  localeSchema,
  pageQuerySchema,
  pageResponseSchema,
} from './common.js';
import { theorySessionModeSchema } from './enums.js';
import { examRulesSchema } from './platform.js';

export const FREE_MOCK_EXAMS_PER_WEEK = 3;
export const THEORY_SESSION_MAX_QUESTIONS = 100;

const answerIndexesSchema = z
  .array(z.number().int().nonnegative())
  .min(1)
  .max(20)
  .refine((indexes) => new Set(indexes).size === indexes.length, {
    message: 'Answer indexes must be distinct',
  });

export const currentQuestionPackQuerySchema = z.object({
  licenceClass: licenceClassSchema.optional(),
  language: localeSchema.optional(),
});
export type CurrentQuestionPackQuery = z.infer<typeof currentQuestionPackQuerySchema>;

export const questionPackSchema = z.object({
  id: z.uuid(),
  countryCode: countryCodeSchema,
  licenceClass: licenceClassSchema,
  language: localeSchema,
  version: z.number().int().positive(),
  questionCount: z.number().int().positive(),
  categories: z.array(z.string()),
  exam: examRulesSchema,
  publishedAt: dateTimeSchema,
});
export type QuestionPack = z.infer<typeof questionPackSchema>;

export const theoryQuestionSchema = z.object({
  id: z.uuid(),
  category: z.string(),
  body: z.string(),
  mediaUrl: z.url().nullable(),
  answers: z.array(z.string()),
  points: z.number().int().positive(),
});
export type TheoryQuestion = z.infer<typeof theoryQuestionSchema>;

export const startTheorySessionRequestSchema = z
  .strictObject({
    mode: theorySessionModeSchema,
    category: z.string().trim().min(1).max(100).optional(),
    questionCount: z.number().int().min(1).max(THEORY_SESSION_MAX_QUESTIONS).optional(),
  })
  .refine(
    (body) =>
      body.mode !== 'mock' || (body.category === undefined && body.questionCount === undefined),
    { message: 'A mock exam follows the exam rules of the pack', path: ['mode'] },
  );
export type StartTheorySessionRequest = z.infer<typeof startTheorySessionRequestSchema>;

export const theorySessionResponseSchema = z.object({
  id: z.uuid(),
  packId: z.uuid(),
  mode: theorySessionModeSchema,
  questionIds: z.array(z.uuid()),
  questions: z.array(theoryQuestionSchema),
  answeredQuestionIds: z.array(z.uuid()),
  startedAt: dateTimeSchema,
  deadlineAt: dateTimeSchema.nullable(),
  finishedAt: dateTimeSchema.nullable(),
});
export type TheorySessionResponse = z.infer<typeof theorySessionResponseSchema>;

export const submitTheoryAnswerRequestSchema = z.strictObject({
  questionId: z.uuid(),
  given: answerIndexesSchema,
});
export type SubmitTheoryAnswerRequest = z.infer<typeof submitTheoryAnswerRequestSchema>;

export const theoryAnswerResultSchema = z.object({
  questionId: z.uuid(),
  correct: z.boolean().nullable(),
  correctAnswers: z.array(z.number().int().nonnegative()).nullable(),
  explanation: z.string().nullable(),
  answeredAt: dateTimeSchema,
});
export type TheoryAnswerResult = z.infer<typeof theoryAnswerResultSchema>;

export const theoryQuestionResultSchema = z.object({
  questionId: z.uuid(),
  given: z.array(z.number().int().nonnegative()).nullable(),
  correct: z.boolean(),
  correctAnswers: z.array(z.number().int().nonnegative()),
  points: z.number().int().positive(),
  explanation: z.string(),
});
export type TheoryQuestionResult = z.infer<typeof theoryQuestionResultSchema>;

export const theorySessionResultSchema = z.object({
  id: z.uuid(),
  mode: theorySessionModeSchema,
  score: z.number().int().nonnegative(),
  maxScore: z.number().int().nonnegative(),
  passed: z.boolean().nullable(),
  finishedAt: dateTimeSchema,
  results: z.array(theoryQuestionResultSchema),
});
export type TheorySessionResult = z.infer<typeof theorySessionResultSchema>;

export const listTheoryMistakesQuerySchema = pageQuerySchema.extend({
  category: z.string().trim().min(1).max(100).optional(),
});
export type ListTheoryMistakesQuery = z.infer<typeof listTheoryMistakesQuerySchema>;

export const theoryMistakeSchema = z.object({
  question: theoryQuestionSchema,
  lastGiven: z.array(z.number().int().nonnegative()),
  lastAnsweredAt: dateTimeSchema,
  wrongCount: z.number().int().positive(),
});
export type TheoryMistake = z.infer<typeof theoryMistakeSchema>;

export const theoryMistakeListResponseSchema = pageResponseSchema(theoryMistakeSchema);
export type TheoryMistakeListResponse = z.infer<typeof theoryMistakeListResponseSchema>;

export const theoryStatsQuerySchema = z.object({ studentId: z.uuid().optional() });
export type TheoryStatsQuery = z.infer<typeof theoryStatsQuerySchema>;

export const theoryCategoryStatsSchema = z.object({
  category: z.string(),
  questions: z.number().int().nonnegative(),
  answered: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
});
export type TheoryCategoryStats = z.infer<typeof theoryCategoryStatsSchema>;

export const theoryStatsResponseSchema = z.object({
  studentId: z.uuid(),
  packId: z.uuid().nullable(),
  premium: z.boolean(),
  questions: z.number().int().nonnegative(),
  answered: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
  openMistakes: z.number().int().nonnegative(),
  mockExamsTaken: z.number().int().nonnegative(),
  mockExamsPassed: z.number().int().nonnegative(),
  lastMockScore: z.number().int().nonnegative().nullable(),
  lastMockMaxScore: z.number().int().nonnegative().nullable(),
  mockExamsLeftThisWeek: z.number().int().nonnegative().nullable(),
  categories: z.array(theoryCategoryStatsSchema),
});
export type TheoryStatsResponse = z.infer<typeof theoryStatsResponseSchema>;
