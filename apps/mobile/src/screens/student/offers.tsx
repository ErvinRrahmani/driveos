import type { SlotOffer } from '@driveos/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../components/error-message';
import { formatDateTime, formatDuration, formatTime } from '../../lib/format';
import { useServices } from '../../lib/session';
import {
  LESSON_QUERIES,
  useAttempt,
  useDisplayZone,
  useInvalidate,
  useOpenSlotOffers,
} from '../../lib/student-data';
import { acceptOffer, offerRecovery, type Recovery, SHOP_HREF } from '../../lib/student-flows';
import { Banner, Button, Card, EmptyState, Screen, Text } from '../../ui';
import { Loadable, useNow } from './common';

type Outcome =
  { kind: 'accepted'; lessonId: string } | { kind: 'failed'; recovery: Recovery; message: string };

export function OffersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const services = useServices();
  const invalidate = useInvalidate();
  const attempt = useAttempt();
  const offers = useOpenSlotOffers();
  const zone = useDisplayZone();
  const now = useNow();
  const [accepting, setAccepting] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const accept = async (offer: SlotOffer) => {
    setAccepting(offer.id);
    setOutcome(null);
    const result = await acceptOffer(services, attempt, offer.id);
    setAccepting(null);
    if (result.ok) {
      setOutcome({ kind: 'accepted', lessonId: result.lesson.id });
      await invalidate(LESSON_QUERIES);
      return;
    }
    const recovery = offerRecovery(result);
    setOutcome({ kind: 'failed', recovery, message: errorMessage(t, result) });
    if (recovery.kind === 'offerGone') await invalidate(['/v1/slot-offers']);
  };

  return (
    <Screen title={t('offers.title')} subtitle={t('offers.subtitle')}>
      {outcome?.kind === 'accepted' ? (
        <>
          <Banner tone="success" message={t('offers.accepted')} />
          <Button
            title={t('offers.openLesson')}
            variant="secondary"
            onPress={() => router.push(`/student/lessons/${outcome.lessonId}`)}
          />
        </>
      ) : null}
      {outcome?.kind === 'failed' ? (
        <>
          <Banner
            tone="danger"
            message={
              outcome.recovery.kind === 'offerGone'
                ? t('offers.gone')
                : outcome.recovery.kind === 'buyCredit'
                  ? t('booking.insufficientBalance')
                  : outcome.message
            }
          />
          {outcome.recovery.kind === 'buyCredit' ? (
            <Button
              title={t('booking.goToShop')}
              variant="secondary"
              onPress={() => router.push(SHOP_HREF)}
            />
          ) : null}
        </>
      ) : null}
      <Loadable query={offers}>
        {(data) => {
          const open = data.items.filter(
            (offer) => offer.status === 'open' && Date.parse(offer.expiresAt) > now,
          );
          if (open.length === 0) {
            return <EmptyState title={t('offers.emptyTitle')} description={t('offers.empty')} />;
          }
          return (
            <>
              {open.map((offer) => (
                <Card key={offer.id}>
                  <Text variant="heading">
                    {formatDateTime(offer.start, zone)} – {formatTime(offer.end, zone)}
                  </Text>
                  <Text>
                    {t('offers.details', {
                      type: offer.lessonTypeName,
                      instructor: offer.instructorName,
                      credit: formatDuration(t, offer.creditMinutes),
                    })}
                  </Text>
                  <Text tone="muted">
                    {t('offers.expires', { time: formatDateTime(offer.expiresAt, zone) })}
                  </Text>
                  <Button
                    title={t('offers.accept')}
                    loading={accepting === offer.id}
                    disabled={accepting !== null}
                    onPress={() => void accept(offer)}
                  />
                </Card>
              ))}
            </>
          );
        }}
      </Loadable>
    </Screen>
  );
}
