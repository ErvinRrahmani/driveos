import type { LessonResponse, SyncOp } from '@driveos/shared';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { mapsUrl, type MapsTarget } from '../../lib/maps';
import { formatDateTime, formatMoney, formatTime } from '../../lib/format';
import type { SyncBadge } from '../../lib/diary/types';
import { useDiary, useDiarySyncStatus } from '../../lib/diary/use-diary';
import { useOnline } from '../../lib/network';
import { useDisplayZone } from '../../lib/student-data';
import { Banner, Button, colors, radius, spacing, Text } from '../../ui';
import { lessonStatusLabel } from '../student/labels';

export function SyncStatusLine() {
  const { t } = useTranslation();
  const diary = useDiary();
  const online = useOnline();
  const { status, pending, conflicts, lastSyncedAt } = useDiarySyncStatus();
  const zone = useDisplayZone();
  const lines: string[] = [];
  if (status === 'syncing') lines.push(t('diary.sync.syncing'));
  else if (status === 'offline') lines.push(t('diary.sync.offline'));
  else if (status === 'error') lines.push(t('diary.sync.error'));
  else if (pending === 0 && conflicts === 0) {
    lines.push(
      lastSyncedAt
        ? t('diary.sync.lastSynced', { time: formatTime(lastSyncedAt, zone) })
        : t('diary.sync.idle'),
    );
  }
  if (pending > 0) lines.push(t('diary.sync.pending', { count: pending }));
  if (conflicts > 0) lines.push(t('diary.sync.conflicts', { count: conflicts }));
  const tone = conflicts > 0 || status === 'error' ? 'warning' : 'info';
  return (
    <View style={styles.status}>
      <Banner tone={tone} message={lines.join(' · ')} />
      {online && status !== 'syncing' && (pending > 0 || status === 'error') ? (
        <Button
          title={t('diary.syncNow')}
          variant="secondary"
          onPress={() => void diary.sync.sync()}
        />
      ) : null}
    </View>
  );
}

export function OpenInMapsButton({ target }: { target: MapsTarget }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const url = mapsUrl(target, Platform.OS);
  if (!url) return null;
  const open = async () => {
    setFailed(false);
    try {
      await Linking.openURL(url);
    } catch {
      setFailed(true);
    }
  };
  return (
    <>
      <Button title={t('diary.actions.openMaps')} variant="secondary" onPress={() => void open()} />
      {failed ? <Banner tone="danger" message={t('diary.actions.mapsFailed')} /> : null}
    </>
  );
}

export function SyncBadgeView({ sync }: { sync: SyncBadge }) {
  const { t } = useTranslation();
  if (sync === 'synced') return null;
  const conflict = sync === 'conflict';
  return (
    <View style={[styles.badge, conflict ? styles.conflict : styles.pending]}>
      <Text variant="caption" style={{ color: conflict ? colors.warning : colors.info }}>
        {conflict ? t('diary.badge.conflict') : t('diary.badge.pending')}
      </Text>
    </View>
  );
}

export function lessonStatusText(t: TFunction, lesson: LessonResponse): string {
  return lessonStatusLabel(t, lesson.status, lesson.lateCancel);
}

export function opLabel(t: TFunction, op: SyncOp, timeZone: string): string {
  switch (op.type) {
    case 'lesson.create':
      return t('diary.op.lessonCreate', { time: formatDateTime(op.payload.start, timeZone) });
    case 'lesson.move':
      return t('diary.op.lessonMove', { time: formatDateTime(op.payload.start, timeZone) });
    case 'lesson.cancel':
      return t('diary.op.lessonCancel');
    case 'lesson.complete':
      return t('diary.op.lessonComplete');
    case 'lesson.no_show':
      return t('diary.op.lessonNoShow');
    case 'progress.upsert':
      return t('diary.op.progress');
    case 'private_note.upsert':
      return t('diary.op.privateNote');
    case 'payment.cash':
      return t('diary.op.cashPayment', {
        amount: formatMoney(op.payload.amountMinor, op.payload.currency),
      });
  }
}

const styles = StyleSheet.create({
  status: { gap: spacing.sm },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  pending: { backgroundColor: colors.infoSurface },
  conflict: { backgroundColor: colors.warningSurface },
});
