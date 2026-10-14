import type { PriceItem } from '@driveos/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { errorMessage } from '../../components/error-message';
import { toFailure } from '../../lib/api-errors';
import { cashItems, cashOp } from '../../lib/diary/cash';
import type { DiaryReader } from '../../lib/diary/store';
import { useDiary, useDiaryData } from '../../lib/diary/use-diary';
import { diaryLesson } from '../../lib/diary/view';
import { formatMoney } from '../../lib/format';
import { useOnline } from '../../lib/network';
import { PERSIST } from '../../lib/query';
import { useServices } from '../../lib/session';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  ListItem,
  LoadingState,
  Screen,
  spacing,
  Text,
} from '../../ui';
import { SyncStatusLine } from './common';

const PRICE_ITEMS_LIMIT = 100;

function usePriceItems() {
  const { api } = useServices();
  return api.$api.useQuery(
    'get',
    '/v1/price-items',
    { params: { query: { active: 'true', limit: PRICE_ITEMS_LIMIT } } },
    { meta: PERSIST },
  );
}

async function readStudentName(
  reader: DiaryReader,
  studentId: string,
  lessonId: string | undefined,
): Promise<string | null> {
  const student = await reader.get('student', studentId);
  if (student) return student.fullName;
  const lesson = lessonId ? (await diaryLesson(reader, lessonId))?.lesson : undefined;
  return lesson?.studentId === studentId ? lesson.studentName : null;
}

function PriceList({
  selected,
  onSelect,
}: {
  selected: PriceItem | null;
  onSelect: (item: PriceItem) => void;
}) {
  const { t } = useTranslation();
  const online = useOnline();
  const prices = usePriceItems();
  if (prices.data) {
    const items = cashItems(prices.data.items);
    if (items.length === 0) return <EmptyState title={t('diary.cash.noItems')} />;
    return (
      <View style={styles.list}>
        {items.map((item) => (
          <ListItem
            key={item.id}
            title={item.name}
            subtitle={formatMoney(item.amountMinor, item.currency)}
            selected={selected?.id === item.id}
            onPress={() => onSelect(item)}
          />
        ))}
      </View>
    );
  }
  if (prices.isError) {
    const failure = toFailure(prices.error);
    return (
      <ErrorState
        message={
          failure.code === 'forbidden' ? t('diary.cash.forbidden') : errorMessage(t, failure)
        }
        onRetry={() => void prices.refetch()}
      />
    );
  }
  if (!online) return <Banner tone="info" message={t('diary.cash.offlineNoPrices')} />;
  return <LoadingState />;
}

export function RecordCashScreen() {
  const { studentId, lessonId } = useLocalSearchParams<{ studentId: string; lessonId?: string }>();
  return (
    <RecordCash key={`${studentId}|${lessonId ?? ''}`} studentId={studentId} lessonId={lessonId} />
  );
}

function RecordCash({ studentId, lessonId }: { studentId: string; lessonId?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const diary = useDiary();
  const student = useDiaryData(`cash|${studentId}|${lessonId ?? ''}`, (reader) =>
    readStudentName(reader, studentId, lessonId),
  );
  const [selected, setSelected] = useState<PriceItem | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'failed'>('idle');

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/instructor'));

  const record = async (item: PriceItem) => {
    setState('busy');
    try {
      await diary.enqueue(cashOp(studentId, item));
      setSelected(null);
      setState('saved');
    } catch {
      setState('failed');
    }
  };

  const name = student.data;
  return (
    <Screen title={t('diary.cash.title')}>
      <Button title={t('diary.cash.back')} variant="ghost" onPress={back} />
      <SyncStatusLine />
      {student.failed ? (
        <ErrorState message={t('diary.loadFailed')} />
      ) : name === undefined ? (
        <LoadingState />
      ) : name === null ? (
        <EmptyState title={t('diary.cash.unknownStudent')} />
      ) : (
        <>
          <Text variant="heading">{t('diary.cash.student', { name })}</Text>
          {state === 'saved' ? <Banner tone="success" message={t('diary.cash.saved')} /> : null}
          {state === 'failed' ? <Banner tone="danger" message={t('diary.actions.failed')} /> : null}
          <Text tone="muted">{t('diary.cash.choose')}</Text>
          <PriceList
            selected={selected}
            onSelect={(item) => {
              setSelected(item);
              setState('idle');
            }}
          />
          {selected ? (
            <Card style={styles.confirm}>
              <Text>
                {t('diary.cash.confirmText', {
                  amount: formatMoney(selected.amountMinor, selected.currency),
                  name,
                  item: selected.name,
                })}
              </Text>
              <Button
                title={t('diary.cash.confirm', {
                  amount: formatMoney(selected.amountMinor, selected.currency),
                })}
                loading={state === 'busy'}
                onPress={() => void record(selected)}
              />
              <Button
                title={t('diary.cash.cancel')}
                variant="ghost"
                disabled={state === 'busy'}
                onPress={() => setSelected(null)}
              />
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  confirm: { gap: spacing.sm },
});
