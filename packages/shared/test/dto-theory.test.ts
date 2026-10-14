import { describe, expect, it } from 'vitest';
import {
  startTheorySessionRequestSchema,
  submitTheoryAnswerRequestSchema,
  theoryAnswerResultSchema,
  theoryQuestionSchema,
  theorySessionResponseSchema,
} from '../src/index.js';
import { DTO_SAMPLES } from '../src/dto/samples/index.js';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('POST /v1/theory/sessions', () => {
  it('accepts the three modes and limits options to non-mock sessions', () => {
    for (const mode of ['practice', 'mock', 'mistakes']) {
      expect(ok(startTheorySessionRequestSchema, { mode })).toBe(true);
    }
    expect(ok(startTheorySessionRequestSchema, { mode: 'exam' })).toBe(false);
    expect(ok(startTheorySessionRequestSchema, { mode: 'practice', category: 'signs' })).toBe(true);
    expect(ok(startTheorySessionRequestSchema, { mode: 'mock', category: 'signs' })).toBe(false);
    expect(ok(startTheorySessionRequestSchema, { mode: 'mock', questionCount: 5 })).toBe(false);
  });

  it('never sends the correct answers or explanations with the questions', () => {
    const question = theoryQuestionSchema.parse({
      ...DTO_SAMPLES.theory.theoryQuestion,
      correct: [0],
      explanation: 'leak',
    });
    expect(question).not.toHaveProperty('correct');
    expect(question).not.toHaveProperty('explanation');
    const session = theorySessionResponseSchema.parse(DTO_SAMPLES.theory.theorySessionResponse);
    expect(session.questions.every((q) => !('correct' in q))).toBe(true);
  });
});

describe('POST /v1/theory/sessions/{id}/answers', () => {
  it('takes distinct answer indexes', () => {
    const questionId = DTO_SAMPLES.theory.submitTheoryAnswerRequest.questionId;
    expect(ok(submitTheoryAnswerRequestSchema, { questionId, given: [0, 2] })).toBe(true);
    expect(ok(submitTheoryAnswerRequestSchema, { questionId, given: [] })).toBe(false);
    expect(ok(submitTheoryAnswerRequestSchema, { questionId, given: [1, 1] })).toBe(false);
    expect(ok(submitTheoryAnswerRequestSchema, { questionId, given: [-1] })).toBe(false);
  });

  it('withholds correctness in mock mode', () => {
    const mock = DTO_SAMPLES.theory.theoryAnswerResult;
    expect(ok(theoryAnswerResultSchema, { ...mock, correct: null, correctAnswers: null })).toBe(
      true,
    );
  });
});
