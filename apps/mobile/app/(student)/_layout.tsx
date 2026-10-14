import { RoleTabs, type TabSpec } from '../../src/components/role-tabs';

const STUDENT_TABS: TabSpec[] = [
  { name: 'student/(home)', title: 'tabs.home', icon: 'home-outline' },
  { name: 'student/lessons', title: 'tabs.lessons', icon: 'car-outline' },
  { name: 'student/theory', title: 'tabs.theory', icon: 'school-outline' },
  { name: 'student/shop', title: 'tabs.shop', icon: 'cart-outline' },
  { name: 'student/chat', title: 'tabs.chat', icon: 'chatbubbles-outline' },
  { name: 'student/account', title: 'tabs.account', icon: 'person-circle-outline' },
];

export default function StudentLayout() {
  return <RoleTabs group="student" tabs={STUDENT_TABS} />;
}
