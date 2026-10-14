import type {
  CurrentQuestionPackQuery,
  ListTheoryMistakesQuery,
  QuestionPack,
  StartTheorySessionRequest,
  SubmitTheoryAnswerRequest,
  TheoryAnswerResult,
  TheoryCategoryStats,
  TheoryMistake,
  TheoryMistakeListResponse,
  TheoryQuestion,
  TheoryQuestionResult,
  TheorySessionResponse,
  TheorySessionResult,
  TheoryStatsQuery,
  TheoryStatsResponse,
} from '../theory.js';
import { SAMPLE_IDS as ids } from './fixtures.js';

const questionIds = [
  '0192f000-0120-7000-8000-000000000001',
  '0192f000-0120-7000-8000-000000000002',
] as const;

const question = {
  id: questionIds[0],
  category: 'signs',
  body: 'SAMPLE: What does a red octagonal sign mean?',
  mediaUrl: null,
  answers: ['Stop', 'Give way', 'No entry'],
  points: 2,
} satisfies TheoryQuestion;

const secondQuestion = {
  id: questionIds[1],
  category: 'rules',
  body: 'SAMPLE: Who has priority at an unmarked junction?',
  mediaUrl: 'https://storage.example.com/packs/xx-b-en/2.1.01.jpg?X-Amz-Signature=sample',
  answers: ['Traffic from the right', 'Traffic from the left'],
  points: 3,
} satisfies TheoryQuestion;

const questionResult = {
  questionId: question.id,
  given: [0],
  correct: true,
  correctAnswers: [0],
  points: 2,
  explanation: 'SAMPLE: A red octagon always means stop.',
} satisfies TheoryQuestionResult;

const mistake = {
  question: secondQuestion,
  lastGiven: [1],
  lastAnsweredAt: '2026-10-05T18:12:00.000Z',
  wrongCount: 2,
} satisfies TheoryMistake;

const categoryStats = {
  category: 'signs',
  questions: 10,
  answered: 8,
  correct: 7,
} satisfies TheoryCategoryStats;

export const theorySamples = {
  currentQuestionPackQuery: {
    licenceClass: 'B',
    language: 'en',
  } satisfies CurrentQuestionPackQuery,
  questionPack: {
    id: ids.questionPack,
    countryCode: 'XX',
    licenceClass: 'B',
    language: 'en',
    version: 202601,
    questionCount: 30,
    categories: ['rules', 'safety', 'signs'],
    exam: {
      rules: 'fraction',
      questions: 30,
      timeLimitMinutes: 45,
      passMark: 0.85,
      categories: { signs: 10, rules: 15, safety: 5 },
    },
    publishedAt: '2026-09-01T08:00:00.000Z',
  } satisfies QuestionPack,
  theoryQuestion: question,
  startTheorySessionRequest: {
    mode: 'practice',
    category: 'signs',
    questionCount: 10,
  } satisfies StartTheorySessionRequest,
  theorySessionResponse: {
    id: ids.theorySession,
    packId: ids.questionPack,
    mode: 'mock',
    questionIds: [...questionIds],
    questions: [question, secondQuestion],
    answeredQuestionIds: [],
    startedAt: '2026-10-06T17:00:00.000Z',
    deadlineAt: '2026-10-06T17:45:00.000Z',
    finishedAt: null,
  } satisfies TheorySessionResponse,
  submitTheoryAnswerRequest: {
    questionId: question.id,
    given: [0],
  } satisfies SubmitTheoryAnswerRequest,
  theoryAnswerResult: {
    questionId: question.id,
    correct: true,
    correctAnswers: [0],
    explanation: 'SAMPLE: A red octagon always means stop.',
    answeredAt: '2026-10-06T17:01:10.000Z',
  } satisfies TheoryAnswerResult,
  theoryQuestionResult: questionResult,
  theorySessionResult: {
    id: ids.theorySession,
    mode: 'mock',
    score: 2,
    maxScore: 5,
    passed: false,
    finishedAt: '2026-10-06T17:30:00.000Z',
    results: [
      questionResult,
      {
        questionId: secondQuestion.id,
        given: null,
        correct: false,
        correctAnswers: [0],
        points: 3,
        explanation: 'SAMPLE: Right before left applies.',
      },
    ],
  } satisfies TheorySessionResult,
  listTheoryMistakesQuery: { category: 'rules', limit: 50 } satisfies ListTheoryMistakesQuery,
  theoryMistake: mistake,
  theoryMistakeListResponse: {
    items: [mistake],
    nextCursor: null,
  } satisfies TheoryMistakeListResponse,
  theoryStatsQuery: { studentId: ids.student } satisfies TheoryStatsQuery,
  theoryCategoryStats: categoryStats,
  theoryStatsResponse: {
    studentId: ids.student,
    packId: ids.questionPack,
    premium: false,
    questions: 30,
    answered: 24,
    correct: 20,
    openMistakes: 4,
    mockExamsTaken: 2,
    mockExamsPassed: 1,
    lastMockScore: 52,
    lastMockMaxScore: 60,
    mockExamsLeftThisWeek: 1,
    categories: [categoryStats, { category: 'rules', questions: 15, answered: 12, correct: 9 }],
  } satisfies TheoryStatsResponse,
};
