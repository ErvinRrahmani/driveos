import type { SyncStudent } from '@driveos/shared';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import type { DiaryReader } from '../../lib/diary/store';
import { useDiaryData } from '../../lib/diary/use-diary';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  spacing,
  Text,
} from '../../ui';
import { OpenInMapsButton, SyncStatusLine } from './common';

async function readStudents(reader: DiaryReader): Promise<SyncStudent[]> {
  return (await reader.list('student')).sort((a, b) => a.fullName.localeCompare(b.fullName));
}

function StudentRow({ student }: { student: SyncStudent }) {
  const { t } = useTranslation();
  const router = useRouter();
  const details = [
    t('diary.students.licenceClass', { licenceClass: student.licenceClass }),
    student.area,
    student.isPrimary ? t('diary.students.primary') : null,
  ].filter(Boolean);
  return (
    <Card style={styles.card}>
      <Text variant="label">{student.fullName}</Text>
      <Text variant="caption" tone="muted">
        {details.join(' · ')}
      </Text>
      {student.pickupAddress ? (
        <Text variant="caption">
          {t('diary.lesson.pickup', { address: student.pickupAddress })}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          title={t('diary.actions.recordCash')}
          variant="secondary"
          onPress={() =>
            router.push({ pathname: '/instructor/cash', params: { studentId: student.id } })
          }
        />
        <OpenInMapsButton
          target={{
            lat: student.pickupLat,
            lng: student.pickupLng,
            address: student.pickupAddress,
          }}
        />
      </View>
    </Card>
  );
}

export function DiaryStudentsScreen() {
  const { t } = useTranslation();
  const students = useDiaryData('students', readStudents);
  return (
    <Screen title={t('diary.students.title')}>
      <SyncStatusLine />
      {students.failed ? (
        <ErrorState message={t('diary.loadFailed')} />
      ) : students.data === undefined ? (
        <LoadingState />
      ) : students.data.length === 0 ? (
        <EmptyState title={t('diary.students.empty')} />
      ) : (
        students.data.map((student) => <StudentRow key={student.id} student={student} />)
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
