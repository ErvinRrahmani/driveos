import { useTranslation } from 'react-i18next';
import { useParentStudents } from '../../lib/parent-context';
import { Screen } from '../../ui';
import { Loadable } from '../student/common';
import { LessonsScreen } from '../student/lessons';
import { NoLinkedStudent, StudentSwitcher } from './switcher';

export function ParentLessonsScreen() {
  const { t } = useTranslation();
  const { query, selected } = useParentStudents();
  if (selected) return <LessonsScreen header={<StudentSwitcher />} />;
  return (
    <Screen title={t('lessons.title')}>
      <Loadable query={query}>{() => <NoLinkedStudent />}</Loadable>
    </Screen>
  );
}
