import { RoleTabs, type TabSpec } from '../../src/components/role-tabs';
import { DiaryProvider, useDiarySyncStatus } from '../../src/lib/diary/use-diary';
import { instructorPushTarget } from '../../src/lib/push-target';
import { usePushResponse } from '../../src/lib/use-push-response';

function PushResponses() {
  usePushResponse(instructorPushTarget);
  return null;
}

function InstructorTabs() {
  const { conflicts } = useDiarySyncStatus();
  const tabs: TabSpec[] = [
    { name: 'instructor/(diary)/index', title: 'tabs.diary', icon: 'today-outline' },
    { name: 'instructor/(diary)/week', title: 'tabs.week', icon: 'calendar-outline' },
    { name: 'instructor/(diary)/students', title: 'tabs.students', icon: 'people-outline' },
    { name: 'instructor/chat', title: 'tabs.chat', icon: 'chatbubbles-outline' },
    {
      name: 'instructor/(diary)/conflicts',
      title: 'tabs.conflicts',
      icon: 'alert-circle-outline',
      badge: conflicts > 0 ? conflicts : undefined,
    },
    {
      name: 'instructor/(diary)/lesson/[id]',
      title: 'diary.lesson.title',
      icon: 'car-outline',
      hidden: true,
    },
    {
      name: 'instructor/(diary)/complete/[id]',
      title: 'diary.complete.title',
      icon: 'checkmark-done-outline',
      hidden: true,
    },
    {
      name: 'instructor/(diary)/cash',
      title: 'diary.cash.title',
      icon: 'cash-outline',
      hidden: true,
    },
    { name: 'instructor/account', title: 'tabs.account', icon: 'person-circle-outline' },
  ];
  return <RoleTabs group="instructor" tabs={tabs} backBehavior="history" />;
}

export default function InstructorLayout() {
  return (
    <DiaryProvider>
      <PushResponses />
      <InstructorTabs />
    </DiaryProvider>
  );
}
