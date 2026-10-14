import type { FreeSlot, LessonType } from '@driveos/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStudentScope } from '../../lib/student-scope';
import { type Chip, Chips } from '../../components/chips';
import { errorMessage } from '../../components/error-message';
import { dayKey, formatDay, formatDuration, formatTime, groupByDay } from '../../lib/format';
import { useServices } from '../../lib/session';
import {
  BOOKING_DAYS_AHEAD,
  LESSON_QUERIES,
  useAttempt,
  useBalance,
  useDayWindow,
  useDisplayZone,
  useInvalidate,
  useLessonTypes,
  useShop,
} from '../../lib/student-data';
import { bookingRecovery, bookLesson, type Recovery } from '../../lib/student-flows';
import { Banner, Button, Card, EmptyState, Input, ListItem, Screen, Text } from '../../ui';
import { Loadable, Section, useNow } from './common';

const ANY = 'any';

function ExamCarHint({ owned, onShop }: { owned: boolean; onShop: () => void }) {
  const { t } = useTranslation();
  if (owned) return <Banner tone="success" message={t('booking.examCarOwned')} />;
  return (
    <>
      <Banner tone="warning" message={t('booking.examCarNeeded')} />
      <Button title={t('booking.goToShop')} variant="secondary" onPress={onShop} />
    </>
  );
}

function SlotPicker({
  lessonType,
  onPick,
  picked,
}: {
  lessonType: LessonType;
  picked: FreeSlot | null;
  onPick: (slot: FreeSlot) => void;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const zone = useDisplayZone();
  const window = useDayWindow(0, BOOKING_DAYS_AHEAD);
  const [instructor, setInstructor] = useState(ANY);
  const [day, setDay] = useState<string | null>(null);
  const now = useNow();
  const slots = api.$api.useQuery('get', '/v1/calendar/free-slots', {
    params: { query: { lessonTypeId: lessonType.id, from: window.from, to: window.to } },
  });

  return (
    <Loadable query={slots}>
      {(data) => {
        const upcoming = data.items.filter((slot) => Date.parse(slot.start) > now);
        if (upcoming.length === 0) return <EmptyState title={t('booking.noSlots')} />;
        const instructors = new Map(
          upcoming.map((slot) => [slot.instructorMembershipId, slot.instructorName]),
        );
        const chips: Chip[] = [
          { key: ANY, label: t('booking.anyInstructor') },
          ...[...instructors].map(([key, label]) => ({ key, label })),
        ];
        const filtered = upcoming.filter(
          (slot) => instructor === ANY || slot.instructorMembershipId === instructor,
        );
        const days = groupByDay(filtered, zone);
        const activeDay = days.find((group) => group.day === day) ?? days[0];
        return (
          <>
            <Section title={t('booking.instructor')}>
              <Chips chips={chips} selected={instructor} onSelect={setInstructor} />
            </Section>
            <Section title={t('booking.day')}>
              <Chips
                chips={days.map((group) => ({ key: group.day, label: formatDay(group.day) }))}
                selected={activeDay?.day ?? null}
                onSelect={setDay}
              />
            </Section>
            <Section title={t('booking.time')}>
              {(activeDay?.items ?? []).map((slot) => (
                <ListItem
                  key={`${slot.start}-${slot.instructorMembershipId}`}
                  title={`${formatTime(slot.start, zone)} – ${formatTime(slot.end, zone)}`}
                  subtitle={slot.instructorName}
                  selected={
                    picked?.start === slot.start &&
                    picked.instructorMembershipId === slot.instructorMembershipId
                  }
                  onPress={() => onPick(slot)}
                />
              ))}
            </Section>
          </>
        );
      }}
    </Loadable>
  );
}

export function BookLessonScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { links } = useStudentScope();
  const services = useServices();
  const invalidate = useInvalidate();
  const attempt = useAttempt();
  const shop = useShop();
  const studentId = shop.data?.studentId;
  const balance = useBalance(studentId);
  const lessonTypes = useLessonTypes();
  const zone = useDisplayZone();
  const [lessonTypeId, setLessonTypeId] = useState<string | null>(null);
  const [slot, setSlot] = useState<FreeSlot | null>(null);
  const [pickup, setPickup] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ recovery: Recovery; message: string } | null>(null);

  const lessonType = useMemo(
    () => lessonTypes.data?.items.find((item) => item.id === lessonTypeId),
    [lessonTypes.data, lessonTypeId],
  );
  const balanceMinutes = balance.data?.balanceMinutes ?? shop.data?.balanceMinutes;
  const examCarOwned =
    (balance.data?.entitlements ?? []).some((item) => item.kind === 'exam_car') ||
    (shop.data?.items ?? []).some((item) => item.entitlementKind === 'exam_car' && item.owned);
  const short =
    lessonType !== undefined &&
    balanceMinutes !== undefined &&
    balanceMinutes < lessonType.creditMinutes;

  const choose = (id: string) => {
    setLessonTypeId(id);
    setSlot(null);
    setProblem(null);
  };

  const book = async () => {
    if (!studentId || !lessonType || !slot) return;
    setBusy(true);
    setProblem(null);
    const result = await bookLesson(services, attempt, {
      studentId,
      instructorMembershipId: slot.instructorMembershipId,
      lessonTypeId: lessonType.id,
      vehicleId: slot.vehicleId,
      start: slot.start,
      ...(pickup.trim() ? { pickupAddress: pickup.trim() } : {}),
    });
    setBusy(false);
    if (result.ok) {
      await invalidate(LESSON_QUERIES);
      router.replace(links.lesson(result.lesson.id));
      return;
    }
    const recovery = bookingRecovery(result);
    if (recovery.kind === 'slotTaken') {
      setSlot(null);
      await invalidate(['/v1/calendar/free-slots']);
    }
    setProblem({ recovery, message: errorMessage(t, result) });
  };

  return (
    <Screen>
      <Section title={t('booking.lessonType')}>
        <Loadable query={lessonTypes}>
          {(data) => (
            <>
              {data.items.map((item) => (
                <ListItem
                  key={item.id}
                  title={item.name}
                  subtitle={t('booking.typeDetails', {
                    minutes: item.minutes,
                    credit: formatDuration(t, item.creditMinutes),
                  })}
                  selected={item.id === lessonTypeId}
                  onPress={() => choose(item.id)}
                />
              ))}
            </>
          )}
        </Loadable>
      </Section>
      {lessonType ? (
        <>
          {lessonType.kind === 'exam' || lessonType.requiresEntitlement === 'exam_car' ? (
            <ExamCarHint owned={examCarOwned} onShop={() => router.push(links.shop)} />
          ) : null}
          {short ? (
            <>
              <Banner
                tone="warning"
                message={t('booking.notEnoughCredit', {
                  balance: formatDuration(t, balanceMinutes ?? 0),
                  credit: formatDuration(t, lessonType.creditMinutes),
                })}
              />
              <Button
                title={t('booking.buyCredit')}
                variant="secondary"
                onPress={() => router.push(links.shop)}
              />
            </>
          ) : null}
          <SlotPicker lessonType={lessonType} picked={slot} onPick={setSlot} />
        </>
      ) : null}
      {lessonType && slot ? (
        <>
          <Input
            label={t('booking.pickup')}
            hint={t('booking.pickupHint')}
            value={pickup}
            onChangeText={setPickup}
            placeholder={t('booking.pickupPlaceholder')}
          />
          <Card>
            <Text variant="label">{t('booking.summary')}</Text>
            <Text>
              {formatDay(dayKey(slot.start, zone))} {formatTime(slot.start, zone)} ·{' '}
              {slot.instructorName}
            </Text>
            <Text tone="muted">
              {t('booking.costAndBalance', {
                credit: formatDuration(t, lessonType.creditMinutes),
                balance: formatDuration(t, balanceMinutes ?? 0),
              })}
            </Text>
          </Card>
          {problem ? (
            <Banner
              tone={problem.recovery.kind === 'retry' ? 'warning' : 'danger'}
              message={
                problem.recovery.kind === 'buyCredit'
                  ? t('booking.insufficientBalance')
                  : problem.recovery.kind === 'slotTaken'
                    ? t('booking.slotTaken')
                    : problem.message
              }
            />
          ) : null}
          {problem?.recovery.kind === 'buyCredit' ? (
            <Button
              title={t('booking.goToShop')}
              variant="secondary"
              onPress={() => router.push(links.shop)}
            />
          ) : null}
          <Button
            title={problem?.recovery.kind === 'retry' ? t('common.retry') : t('booking.confirm')}
            loading={busy}
            disabled={!studentId}
            onPress={() => void book()}
          />
        </>
      ) : null}
    </Screen>
  );
}
