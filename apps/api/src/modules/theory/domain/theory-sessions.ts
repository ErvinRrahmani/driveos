import { FREE_MOCK_EXAMS_PER_WEEK } from '@driveos/shared';
import { type RandomSource, shuffle } from '../../../adapters/exam-rules/exam-rules.js';

export const MOCK_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export interface AnswerFact {
  externalRef: string;
  given: number[];
  correct: boolean;
  answeredAt: Date;
}

export interface LatestAnswer extends AnswerFact {
  wrongCount: number;
}

export interface MistakeFact {
  externalRef: string;
  lastGiven: number[];
  lastAnsweredAt: Date;
  wrongCount: number;
}

export function latestAnswers(history: readonly AnswerFact[]): Map<string, LatestAnswer> {
  const latest = new Map<string, LatestAnswer>();
  for (const answer of history) {
    const current = latest.get(answer.externalRef);
    const wrongCount = (current?.wrongCount ?? 0) + (answer.correct ? 0 : 1);
    const newer = !current || answer.answeredAt.getTime() >= current.answeredAt.getTime();
    latest.set(answer.externalRef, newer ? { ...answer, wrongCount } : { ...current, wrongCount });
  }
  return latest;
}

export function openMistakes(history: readonly AnswerFact[]): MistakeFact[] {
  return [...latestAnswers(history).values()]
    .filter((answer) => !answer.correct)
    .map((answer) => ({
      externalRef: answer.externalRef,
      lastGiven: answer.given,
      lastAnsweredAt: answer.answeredAt,
      wrongCount: answer.wrongCount,
    }))
    .sort(
      (a, b) =>
        b.lastAnsweredAt.getTime() - a.lastAnsweredAt.getTime() ||
        a.externalRef.localeCompare(b.externalRef),
    );
}

export function mockWindowStart(now: Date): Date {
  return new Date(now.getTime() - MOCK_WINDOW_DAYS * DAY_MS);
}

export function mockExamsLeft(
  startedInWindow: number,
  limit: number = FREE_MOCK_EXAMS_PER_WEEK,
): number {
  return Math.max(0, limit - startedInWindow);
}

export function deadlineFor(startedAt: Date, timeLimitMinutes: number): Date {
  return new Date(startedAt.getTime() + timeLimitMinutes * MINUTE_MS);
}

export function isPastDeadline(deadlineAt: Date | null, now: Date): boolean {
  return deadlineAt !== null && now.getTime() > deadlineAt.getTime();
}

export function drawPractice<Q extends { category: string }>(
  questions: readonly Q[],
  filter: { category?: string; count: number },
  random: RandomSource = Math.random,
): Q[] {
  const candidates = filter.category
    ? questions.filter((question) => question.category === filter.category)
    : questions;
  return shuffle(candidates, random).slice(0, filter.count);
}
