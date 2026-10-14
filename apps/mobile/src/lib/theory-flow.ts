import {
  submitTheoryAnswerRequestSchema,
  type TheoryAnswerResult,
  type TheorySessionMode,
  type TheorySessionResponse,
  type TheorySessionResult,
} from '@driveos/shared';
import type { AppServices } from './api';
import { failure, type FlowResult, send } from './flow';

export async function startTheorySession(
  services: AppServices,
  mode: TheorySessionMode,
): Promise<FlowResult<{ session: TheorySessionResponse }>> {
  const result = await send(() =>
    services.api.fetchClient.POST('/v1/theory/sessions', { body: { mode } }),
  );
  return result.ok ? { ok: true, session: result.data } : failure(result);
}

export async function answerQuestion(
  services: AppServices,
  sessionId: string,
  questionId: string,
  given: number[],
): Promise<FlowResult<{ result: TheoryAnswerResult }>> {
  if (!submitTheoryAnswerRequestSchema.shape.given.safeParse(given).success) {
    return { ok: false, code: 'validation_error', message: null };
  }
  const result = await send(() =>
    services.api.fetchClient.POST('/v1/theory/sessions/{id}/answers', {
      params: { path: { id: sessionId } },
      body: { questionId, given },
    }),
  );
  return result.ok ? { ok: true, result: result.data } : failure(result);
}

export async function finishTheorySession(
  services: AppServices,
  sessionId: string,
): Promise<FlowResult<{ result: TheorySessionResult }>> {
  const result = await send(() =>
    services.api.fetchClient.POST('/v1/theory/sessions/{id}/finish', {
      params: { path: { id: sessionId } },
    }),
  );
  return result.ok ? { ok: true, result: result.data } : failure(result);
}

export function nextUnanswered(
  session: Pick<TheorySessionResponse, 'questionIds' | 'answeredQuestionIds'>,
  answeredHere: readonly string[],
): number | null {
  const done = new Set([...session.answeredQuestionIds, ...answeredHere]);
  const index = session.questionIds.findIndex((id) => !done.has(id));
  return index === -1 ? null : index;
}
