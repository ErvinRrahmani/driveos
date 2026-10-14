import { z } from 'zod';
import {
  countryCodeSchema,
  dateTimeSchema,
  licenceClassSchema,
  localeSchema,
} from '../dto/common.js';
import { theorySessionModeSchema } from '../dto/enums.js';
import { defineEvent } from './define-event.js';

export const QuestionPackPublished = defineEvent({
  type: 'QuestionPackPublished',
  version: 1,
  schema: z.object({
    packId: z.uuid(),
    countryCode: countryCodeSchema,
    licenceClass: licenceClassSchema,
    language: localeSchema,
    packVersion: z.number().int().positive(),
    questionCount: z.number().int().positive(),
    publishedAt: dateTimeSchema,
  }),
});

export const TheorySessionFinished = defineEvent({
  type: 'TheorySessionFinished',
  version: 1,
  schema: z.object({
    sessionId: z.uuid(),
    studentId: z.uuid(),
    packId: z.uuid(),
    mode: theorySessionModeSchema,
    questionCount: z.number().int().nonnegative(),
    score: z.number().int().nonnegative(),
    maxScore: z.number().int().nonnegative(),
    passed: z.boolean().nullable(),
    startedAt: dateTimeSchema,
    finishedAt: dateTimeSchema,
  }),
});
