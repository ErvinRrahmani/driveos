import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { errorMessage } from '../../components/error-message';
import {
  REVIEW_RATINGS,
  reviewOutcome,
  reviewSubmission,
  reviewTextRemaining,
  submitReview,
} from '../../lib/review-flow';
import { useServices } from '../../lib/session';
import { Banner, Button, Card, colors, Input, Screen, spacing, Text } from '../../ui';

type Outcome =
  | { kind: 'sent' }
  | { kind: 'not_available' }
  | { kind: 'already_sent' }
  | { kind: 'error'; message: string };

const STAR_SIZE = 36;

export function ReviewScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const services = useServices();
  const ratingLabelId = useId();
  const [rating, setRating] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const submission = reviewSubmission({ rating, text });
  const remaining = reviewTextRemaining(text);

  // The tab stays mounted: forget a refusal when the student leaves, so a later visit asks again.
  useFocusEffect(
    useCallback(
      () => () =>
        setOutcome((current) =>
          current?.kind === 'not_available' || current?.kind === 'error' ? null : current,
        ),
      [],
    ),
  );

  const send = async () => {
    if (!submission.ok) return;
    setBusy(true);
    setOutcome(null);
    const result = await submitReview(services, submission.body);
    setBusy(false);
    if (result.ok) {
      setOutcome({ kind: 'sent' });
      return;
    }
    const kind = reviewOutcome(result);
    setOutcome(kind === 'error' ? { kind, message: errorMessage(t, result) } : { kind });
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/student'));

  if (outcome?.kind === 'sent' || outcome?.kind === 'already_sent') {
    return (
      <Screen title={t('review.title')}>
        <Banner
          tone="success"
          message={outcome.kind === 'sent' ? t('review.thanks') : t('review.alreadySent')}
        />
        <Button title={t('review.back')} variant="secondary" onPress={goBack} />
      </Screen>
    );
  }

  if (outcome?.kind === 'not_available') {
    return (
      <Screen title={t('review.title')}>
        <Banner tone="info" message={t('review.notYet')} />
        <Button title={t('review.back')} variant="secondary" onPress={goBack} />
      </Screen>
    );
  }

  return (
    <Screen title={t('review.title')} subtitle={t('review.subtitle')}>
      {outcome?.kind === 'error' ? <Banner tone="danger" message={outcome.message} /> : null}
      <Card style={styles.stack}>
        <Text variant="label" nativeID={ratingLabelId}>
          {t('review.ratingLabel')}
        </Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabelledBy={ratingLabelId}
          style={styles.stars}
        >
          {REVIEW_RATINGS.map((value) => {
            const selected = rating === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected, checked: selected }}
                accessibilityLabel={t('review.starLabel', { count: value })}
                hitSlop={spacing.xs}
                onPress={() => setRating(value)}
                style={styles.star}
              >
                <Ionicons
                  name={rating !== null && value <= rating ? 'star' : 'star-outline'}
                  size={STAR_SIZE}
                  color={rating !== null && value <= rating ? colors.primary : colors.muted}
                />
              </Pressable>
            );
          })}
        </View>
        <Input
          label={t('review.textLabel')}
          placeholder={t('review.textPlaceholder')}
          value={text}
          onChangeText={setText}
          multiline
          textAlignVertical="top"
          style={styles.text}
          hint={t('review.remaining', { count: Math.max(remaining, 0) })}
          error={remaining < 0 ? t('review.textTooLong') : null}
        />
        <Button
          title={t('review.submit')}
          loading={busy}
          disabled={!submission.ok}
          onPress={() => void send()}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  stars: { flexDirection: 'row', gap: spacing.sm },
  star: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  text: { minHeight: 120, paddingVertical: spacing.sm },
});
