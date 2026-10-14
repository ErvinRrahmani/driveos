import { RoleTabs, type TabSpec } from '../../src/components/role-tabs';
import { studentPushTarget } from '../../src/lib/push-target';
import { usePushResponse } from '../../src/lib/use-push-response';

const STUDENT_TABS: TabSpec[] = [
  { name: 'student/(home)', title: 'tabs.home', icon: 'home-outline' },
  { name: 'student/lessons', title: 'tabs.lessons', icon: 'car-outline' },
  { name: 'student/theory', title: 'tabs.theory', icon: 'school-outline' },
  { name: 'student/shop', title: 'tabs.shop', icon: 'cart-outline' },
  { name: 'student/chat', title: 'tabs.chat', icon: 'chatbubbles-outline' },
  { name: 'student/account', title: 'tabs.account', icon: 'person-circle-outline' },
  { name: 'student/review', title: 'review.title', icon: 'star-outline', hidden: true },
];

function PushResponses() {
  usePushResponse(studentPushTarget);
  return null;
}

export default function StudentLayout() {
  return (
    <>
      <PushResponses />
      <RoleTabs group="student" tabs={STUDENT_TABS} />
    </>
  );
}
