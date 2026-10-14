import type {
  TheoryAnswerResult,
  TheorySessionResponse,
  TheorySessionResult,
} from '@driveos/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { errorMessage } from '../../components/error-message';
import { useServices } from '../../lib/session';
import { useCountdown } from '../../lib/use-countdown';
import { formatCountdown } from '../../lib/theory-timer';
import { answerQuestion, finishTheorySession, nextUnanswered } from '../../lib/theory-flow';
import { Banner, Button, Card, EmptyState, ListItem, Screen, spacing, Text } from '../../ui';
import { theorySessionKey } from './theory';

function ResultView({
  session,
  result,
}: {
  session: TheorySessionResponse;
  result: TheorySessionResult;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const questions = new Map(session.questions.map((question) => [question.id, question]));
  return (
    <Screen title={t('theory.resultTitle')}>
      <Card accessibilityLabel={t('theory.resultTitle')}>
        <Text variant="heading">
          {t('theory.score', { score: result.score, max: result.maxScore })}
        </Text>
        {result.passed === null ? null : (
          <Banner
            tone={result.passed ? 'success' : 'danger'}
            message={result.passed ? t('theory.passed') : t('theory.failed')}
          />
        )}
      </Card>
      {result.results.map((item, index) => {
        const question = questions.get(item.questionId);
        return (
          <Card key={item.questionId}>
            <Text variant="label">
              {t('theory.questionNumber', { number: index + 1 })} ·{' '}
              {item.correct ? t('theory.correct') : t('theory.wrong')}
            </Text>
            {question ? <Text>{question.body}</Text> : null}
            {question ? (
              <Text tone="muted">
                {t('theory.correctAnswer', {
                  answer: item.correctAnswers.map((answer) => question.answers[answer]).join(', '),
                })}
              </Text>
            ) : null}
            {item.explanation ? <Text tone="muted">{item.explanation}</Text> : null}
          </Card>
        );
      })}
      <Button title={t('theory.backToTheory')} onPress={() => router.replace('/student/theory')} />
    </Screen>
  );
}

export function TheorySessionScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const services = useServices();
  const queryClient = useQueryClient();
  const [session] = useState(() =>
    queryClient.getQueryData<TheorySessionResponse>(theorySessionKey(id)),
  );
  const [answered, setAnswered] = useState<string[]>([]);
  const [index, setIndex] = useState<number | null>(() =>
    session ? nextUnanswered(session, []) : null,
  );
  const [selected, setSelected] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<TheoryAnswerResult | null>(null);
  const [result, setResult] = useState<TheorySessionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const finishing = useRef(false);

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    setBusy(true);
    const finished = await finishTheorySession(services, id);
    setBusy(false);
    if (!finished.ok) {
      finishing.current = false;
      setFailure(errorMessage(t, finished));
      return;
    }
    setResult(finished.result);
    void queryClient.invalidateQueries({ queryKey: ['get', '/v1/theory/stats'] });
  }, [id, queryClient, services, t]);

  const remaining = useCountdown(session?.mode === 'mock' ? session.deadlineAt : null, () => {
    void finish();
  });

  if (!session) {
    return (
      <Screen>
        <EmptyState title={t('theory.sessionGone')} description={t('theory.sessionGoneBody')} />
      </Screen>
    );
  }
  if (result) return <ResultView session={session} result={result} />;

  const question = index === null ? undefined : session.questions[index];
  const mock = session.mode === 'mock';
  const total = session.questions.length;

  const advance = (done: string[]) => {
    setSelected([]);
    setFeedback(null);
    setIndex(nextUnanswered(session, done));
  };

  const submit = async () => {
    if (!question) return;
    setBusy(true);
    setFailure(null);
    const answer = await answerQuestion(services, session.id, question.id, selected);
    setBusy(false);
    if (!answer.ok) {
      setFailure(errorMessage(t, answer));
      return;
    }
    const done = [...answered, question.id];
    setAnswered(done);
    if (mock || answer.result.correct === null) advance(done);
    else setFeedback(answer.result);
  };

  const toggle = (answer: number) => {
    if (feedback) return;
    setSelected((current) =>
      current.includes(answer) ? current.filter((item) => item !== answer) : [...current, answer],
    );
  };

  return (
    <Screen
      title={
        mock
          ? t('theory.mockTitle')
          : session.mode === 'mistakes'
            ? t('theory.mistakesTitle')
            : t('theory.practiceTitle')
      }
      subtitle={
        question && index !== null ? t('theory.progress', { number: index + 1, total }) : undefined
      }
    >
      {mock && remaining !== null ? (
        <Banner
          tone={remaining < 60_000 ? 'danger' : 'info'}
          accessibilityLabel={t('theory.timeLeft', { time: formatCountdown(remaining) })}
          message={t('theory.timeLeft', { time: formatCountdown(remaining) })}
        />
      ) : null}
      {failure ? <Banner tone="danger" message={failure} /> : null}
      {question ? (
        <>
          <Card>
            <Text variant="caption" tone="muted">
              {t('theory.points', { count: question.points })}
            </Text>
            <Text variant="heading">{question.body}</Text>
            <Text variant="caption" tone="muted">
              {t('theory.selectAll')}
            </Text>
          </Card>
          <View style={styles.answers}>
            {question.answers.map((answer, answerIndex) => {
              const correct = feedback?.correctAnswers?.includes(answerIndex) ?? false;
              return (
                <ListItem
                  key={answer}
                  title={answer}
                  selected={selected.includes(answerIndex)}
                  subtitle={feedback && correct ? t('theory.correctOption') : undefined}
                  onPress={() => toggle(answerIndex)}
                />
              );
            })}
          </View>
          {feedback ? (
            <>
              <Banner
                tone={feedback.correct ? 'success' : 'danger'}
                message={feedback.correct ? t('theory.correct') : t('theory.wrong')}
              />
              {feedback.explanation ? <Text tone="muted">{feedback.explanation}</Text> : null}
              <Button title={t('theory.next')} onPress={() => advance(answered)} />
            </>
          ) : (
            <Button
              title={t('theory.submit')}
              loading={busy}
              disabled={selected.length === 0}
              onPress={() => void submit()}
            />
          )}
        </>
      ) : (
        <Card>
          <Text>{t('theory.allAnswered')}</Text>
        </Card>
      )}
      <Button
        title={mock ? t('theory.finishMock') : t('theory.finish')}
        variant={question ? 'ghost' : 'primary'}
        loading={busy && !question}
        disabled={busy}
        onPress={() => void finish()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  answers: { gap: spacing.sm },
});
