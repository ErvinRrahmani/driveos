import { RoleTabs, type TabSpec } from '../../src/components/role-tabs';
import { ParentStudentsProvider, useHasConversations } from '../../src/lib/parent-context';
import { resolveDestination } from '../../src/lib/route-group';
import { useAuthState } from '../../src/lib/session';

const PARENT_TABS: TabSpec[] = [
  { name: 'parent/(home)', title: 'tabs.home', icon: 'home-outline' },
  { name: 'parent/lessons', title: 'tabs.lessons', icon: 'car-outline' },
  { name: 'parent/money', title: 'tabs.money', icon: 'wallet-outline' },
  { name: 'parent/chat', title: 'tabs.chat', icon: 'chatbubbles-outline' },
  { name: 'parent/account', title: 'tabs.account', icon: 'person-circle-outline' },
];

function ParentTabs({ signedIn }: { signedIn: boolean }) {
  const hasChat = useHasConversations(signedIn);
  const tabs = PARENT_TABS.map((tab) =>
    tab.name === 'parent/chat' ? { ...tab, hidden: !hasChat } : tab,
  );
  return <RoleTabs group="parent" tabs={tabs} />;
}

export default function ParentLayout() {
  const signedIn = resolveDestination(useAuthState()) === '/parent';
  return (
    <ParentStudentsProvider enabled={signedIn}>
      <ParentTabs signedIn={signedIn} />
    </ParentStudentsProvider>
  );
}
