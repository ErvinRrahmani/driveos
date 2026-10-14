import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Chips } from '../../components/chips';
import type { LinkedStudent } from '../../lib/parent-students';
import { useParentStudents } from '../../lib/parent-context';
import { Banner, Text } from '../../ui';

export function studentLabel(t: TFunction, student: LinkedStudent | null): string {
  return student?.name ?? t('parent.yourChild');
}

export function StudentSwitcher() {
  const { t } = useTranslation();
  const { students, selected, select, query } = useParentStudents();
  return (
    <>
      {students.length > 1 ? (
        <Chips
          chips={students.map((student) => ({ key: student.id, label: studentLabel(t, student) }))}
          selected={selected?.id ?? null}
          onSelect={select}
        />
      ) : selected?.name ? (
        <Text tone="muted">{t('parent.forStudent', { name: selected.name })}</Text>
      ) : null}
      {query.data?.complete === false ? (
        <Banner tone="info" message={t('parent.incompleteList')} />
      ) : null}
    </>
  );
}

export function NoLinkedStudent() {
  const { t } = useTranslation();
  return <Banner tone="info" message={t('parent.noStudentYet')} />;
}
