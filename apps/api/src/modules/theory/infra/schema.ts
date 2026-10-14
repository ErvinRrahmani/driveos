import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamps, tstz } from '../../../kernel/db/columns.js';
import { schoolId } from '../../school/infra/schema.js';
import { students } from '../../training/infra/schema.js';

export const questionPacksStatus = pgEnum('question_packs_status', ['draft', 'published']);

export const questionPacks = pgTable(
  'question_packs',
  {
    id: id(),
    countryCode: text('country_code').notNull(),
    licenceClass: text('licence_class').notNull(),
    language: text('language').notNull(),
    version: integer('version').notNull(),
    examRules: jsonb('exam_rules').notNull(),
    status: questionPacksStatus('status').notNull(),
    publishedAt: tstz('published_at'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('question_packs_country_class_language_version_key').on(
      t.countryCode,
      t.licenceClass,
      t.language,
      t.version,
    ),
  ],
);

export const questions = pgTable(
  'questions',
  {
    id: id(),
    packId: uuid('pack_id')
      .notNull()
      .references(() => questionPacks.id),
    externalRef: text('external_ref').notNull(),
    category: text('category').notNull(),
    body: jsonb('body').notNull(),
    mediaKey: text('media_key'),
    answers: jsonb('answers').notNull(),
    correct: jsonb('correct').notNull(),
    points: smallint('points').notNull(),
    explanation: text('explanation').notNull(),
    instantFail: boolean('instant_fail').notNull().default(false),
    ...timestamps(),
  },
  (t) => [uniqueIndex('questions_pack_ref_key').on(t.packId, t.externalRef)],
);

export const theorySessionsMode = pgEnum('theory_sessions_mode', ['practice', 'mock', 'mistakes']);

export const theorySessions = pgTable(
  'theory_sessions',
  {
    id: id(),
    schoolId: schoolId(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    packId: uuid('pack_id')
      .notNull()
      .references(() => questionPacks.id),
    mode: theorySessionsMode('mode').notNull(),
    questionIds: uuid('question_ids').array().notNull(),
    startedAt: tstz('started_at').notNull(),
    deadlineAt: tstz('deadline_at'),
    finishedAt: tstz('finished_at'),
    score: integer('score'),
    maxScore: integer('max_score'),
    passed: boolean('passed'),
    ...timestamps(),
  },
  (t) => [
    index('theory_sessions_student_mode_started_idx').on(
      t.schoolId,
      t.studentId,
      t.mode,
      t.startedAt,
    ),
  ],
);

export const theoryAnswers = pgTable(
  'theory_answers',
  {
    id: id(),
    schoolId: schoolId(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => theorySessions.id),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id),
    given: jsonb('given').notNull(),
    correct: boolean('correct').notNull(),
    answeredAt: tstz('answered_at').notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('theory_answers_session_question_key').on(t.sessionId, t.questionId),
    index('theory_answers_school_question_idx').on(t.schoolId, t.questionId),
  ],
);
