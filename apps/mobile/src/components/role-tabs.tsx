import { Ionicons } from '@expo/vector-icons';
import type { ParseKeys } from 'i18next';
import { Redirect, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveDestination, type RouteGroup } from '../lib/route-group';
import { useAuthState } from '../lib/session';
import { usePushRegistration } from '../lib/use-push-registration';
import { colors, LoadingState } from '../ui';

type AppGroup = Exclude<RouteGroup, 'staff-only'>;

export interface TabSpec {
  name: string;
  title: ParseKeys;
  icon: ComponentProps<typeof Ionicons>['name'];
  hidden?: boolean;
  badge?: number;
}

const defaultTabs = (group: AppGroup): TabSpec[] => [
  { name: `${group}/index`, title: 'tabs.home', icon: 'home-outline' },
  { name: `${group}/account`, title: 'tabs.account', icon: 'person-circle-outline' },
];

function PushRegistration() {
  usePushRegistration();
  return null;
}

export function RoleTabs({
  group,
  tabs,
  backBehavior,
}: {
  group: AppGroup;
  tabs?: TabSpec[];
  backBehavior?: 'history';
}) {
  const { t } = useTranslation();
  const destination = resolveDestination(useAuthState());

  if (destination === null) return <LoadingState />;
  if (destination !== `/${group}`) return <Redirect href={destination} />;

  return (
    <>
      <PushRegistration />
      <Tabs
        backBehavior={backBehavior}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
        }}
      >
        {(tabs ?? defaultTabs(group)).map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: t(tab.title),
              ...(tab.hidden ? { href: null } : {}),
              ...(tab.badge === undefined ? {} : { tabBarBadge: tab.badge }),
              tabBarIcon: ({ color, size }) => (
                <Ionicons name={tab.icon} color={color} size={size} />
              ),
            }}
          />
        ))}
      </Tabs>
    </>
  );
}
