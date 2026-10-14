import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  JsonQuestionBankImporter,
  loadQuestionPackFile,
  packVersionNumber,
} from '../../src/adapters/question-bank/json-question-bank-importer.js';
import { QuestionPackInvalidError } from '../../src/adapters/question-bank/question-bank-importer.js';

const PACKS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../packs');
const importer = new JsonQuestionBankImporter();

const validPack = (): {
  exam: { questions: number; categories: Record<string, number> } & Record<string, unknown>;
  questions: Record<string, unknown>[];
} & Record<string, unknown> => ({
  country: 'XX',
  licenceClass: 'B',
  language: 'en',
  version: '2026.2',
  exam: {
    rules: 'fraction',
    questions: 2,
    timeLimitMinutes: 5,
    passMark: 0.5,
    categories: { signs: 1 },
  },
  questions: [
    {
      ref: 'T-1',
      category: 'signs',
      body: 'SAMPLE: one?',
      media: null,
      answers: ['a', 'b'],
      correct: [0],
      points: 1,
      explanation: 'SAMPLE',
    },
    {
      ref: 'T-2',
      category: 'rules',
      body: 'SAMPLE: two?',
      media: 'sample/two.png',
      answers: ['a', 'b', 'c'],
      correct: [1, 2],
      points: 2,
      explanation: 'SAMPLE',
    },
  ],
});

function issuesOf(source: unknown): string[] {
  try {
    importer.parse(source);
  } catch (error) {
    if (error instanceof QuestionPackInvalidError) {
      return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    }
    throw error;
  }
  throw new Error('Expected the pack to be rejected');
}

describe('packVersionNumber', () => {
  it('maps "YYYY.N" to an integer that sorts by release', () => {
    expect(packVersionNumber('2026.1')).toBe(202601);
    expect(packVersionNumber('2026.12')).toBe(202612);
    expect(packVersionNumber('2027.1')).toBeGreaterThan(packVersionNumber('2026.12'));
  });
});

describe('JsonQuestionBankImporter', () => {
  it('parses the SAMPLE fraction pack', async () => {
    const pack = await loadQuestionPackFile(importer, path.join(PACKS_DIR, 'sample-B-en.json'));
    expect(pack).toMatchObject({
      countryCode: 'XX',
      licenceClass: 'B',
      language: 'en',
      version: 202601,
      exam: { rules: 'fraction', questions: 10, passMark: 0.8 },
    });
    expect(pack.questions).toHaveLength(12);
    expect(pack.questions[0]).toEqual({
      externalRef: 'SAMPLE-1.01',
      category: 'signs',
      body: 'SAMPLE: What does a red octagonal sign usually mean?',
      mediaKey: null,
      answers: ['Give way', 'Stop', 'No entry'],
      correct: [1],
      points: 2,
      explanation: 'SAMPLE: A red octagon is the usual stop sign.',
      instantFail: false,
    });
  });

  it('parses the SAMPLE error_points pack with its instant-fail question', async () => {
    const pack = await loadQuestionPackFile(
      importer,
      path.join(PACKS_DIR, 'sample-error-points-B-en.json'),
    );
    expect(pack.exam).toMatchObject({ rules: 'error_points', maxErrorPoints: 3 });
    expect(pack.questions.filter((q) => q.instantFail).map((q) => q.externalRef)).toEqual([
      'SAMPLE-EP-2.01',
    ]);
    expect(pack.questions.find((q) => q.externalRef === 'SAMPLE-EP-1.02')?.mediaKey).toBe(
      'sample/warning-signs.png',
    );
  });

  it('accepts a minimal valid pack', () => {
    expect(importer.parse(validPack()).questions).toHaveLength(2);
  });

  it('rejects a pack that does not match the format', () => {
    const { country: _country, ...noCountry } = validPack();
    expect(issuesOf(noCountry)).toEqual([expect.stringMatching(/^country: /)]);
    expect(issuesOf({ ...validPack(), version: '26' })).toEqual([
      expect.stringMatching(/^version: /),
    ]);
  });

  it('rejects duplicate refs and correct answers that do not exist', () => {
    const pack = validPack();
    const [first, second] = pack.questions;
    Object.assign(second ?? {}, { ref: 'T-1' });
    Object.assign(first ?? {}, { correct: [2] });
    expect(issuesOf(pack)).toEqual([
      expect.stringMatching(/^questions\.0\.correct: /),
      expect.stringMatching(/^questions\.1\.ref: /),
    ]);
  });

  it('rejects exam rules the questions cannot fill', () => {
    const tooMany = validPack();
    tooMany.exam.questions = 3;
    expect(issuesOf(tooMany)).toEqual([expect.stringMatching(/^exam\.questions: /)]);

    const shortCategory = validPack();
    shortCategory.exam.categories = { signs: 2 };
    expect(issuesOf(shortCategory)).toEqual([expect.stringMatching(/^exam\.categories\.signs: /)]);

    const overTotal = validPack();
    overTotal.exam.categories = { signs: 1, rules: 1, safety: 0 };
    overTotal.exam.questions = 1;
    expect(issuesOf(overTotal)).toEqual([expect.stringMatching(/^exam\.categories: /)]);
  });

  it('rejects instant-fail questions in a fraction pack', () => {
    const pack = validPack();
    Object.assign(pack.questions[0] ?? {}, { instantFail: true });
    expect(issuesOf(pack)).toEqual([expect.stringMatching(/^questions\.0\.instantFail: /)]);
  });
});
