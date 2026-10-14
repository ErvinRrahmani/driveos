import type { MeResponse } from '@driveos/shared';
import { Link, Outlet, useRouter } from '@tanstack/react-router';
import { Car, Menu } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiHealth } from '@/components/api-status';
import { SchoolSwitcher } from '@/components/school-switcher';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserMenu } from '@/components/user-menu';
import { StaffOnly } from '@/components/staff-only';
import { useAuthState } from '@/hooks/use-auth-state';
import { useServices } from '@/hooks/use-services';
import { SessionContext, type SessionContextValue } from '@/hooks/use-session';
import { visibleNavItems } from '@/lib/navigation';
import { isStaff, permissionsForRoles } from '@/lib/permissions';

function sessionFrom(me: MeResponse | undefined): SessionContextValue | null {
  if (!me?.active) return null;
  const active = me.active;
  const membership = me.memberships.find((m) => m.membershipId === active.membershipId);
  return {
    me,
    schoolName: membership?.schoolName ?? '',
    permissions: permissionsForRoles(active.roles),
  };
}

export function AppShell() {
  const { t } = useTranslation();
  const { api } = useServices();
  const authState = useAuthState();
  const router = useRouter();
  const signedIn = authState.accessToken !== null || authState.refreshToken !== null;
  const me = api.$api.useQuery('get', '/v1/me', {}, { enabled: signedIn });
  const session = useMemo(() => sessionFrom(me.data), [me.data]);

  useEffect(() => {
    if (signedIn) return;
    const { href, pathname } = router.state.location;
    if (pathname === '/login') return;
    void router.navigate({ to: '/login', search: { redirect: href }, replace: true });
  }, [signedIn, router]);

  if (!signedIn) return null;
  if (me.isPending) return <LoadingState className="min-h-screen" />;
  if (me.isError) {
    return (
      <div className="mx-auto max-w-md p-8">
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      </div>
    );
  }
  if (!session || !session.me.active || !isStaff(session.me.active.roles)) {
    return <StaffOnly me={me.data} />;
  }

  const nav = visibleNavItems(session.permissions);
  const activeMembershipId = session.me.active.membershipId;

  return (
    <SessionContext.Provider value={session}>
      <a
        href="#main"
        className="bg-background sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t('app.skipToContent')}
      </a>
      <div className="bg-muted/30 flex min-h-screen">
        <aside className="bg-background hidden w-60 shrink-0 flex-col border-r md:flex">
          <div className="flex h-14 items-center gap-2 border-b px-4 font-semibold">
            <Car className="size-5" aria-hidden />
            {t('app.title')}
          </div>
          <nav aria-label={t('shell.mainNavigation')} className="flex flex-1 flex-col gap-1 p-3">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === '/', includeSearch: false }}
                className="text-muted-foreground hover:bg-accent hover:text-foreground data-[status=active]:bg-accent data-[status=active]:text-foreground flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
              >
                <item.icon className="size-4" aria-hidden />
                {t(item.labelKey)}
              </Link>
            ))}
          </nav>
          <div className="border-t p-4">
            <ApiHealth client={api} />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="bg-background flex h-14 items-center gap-3 border-b px-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label={t('shell.openMenu')}
                >
                  <Menu aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {nav.map((item) => (
                  <DropdownMenuItem key={item.to} asChild>
                    <Link to={item.to}>{t(item.labelKey)}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <SchoolSwitcher
              memberships={session.me.memberships}
              activeMembershipId={activeMembershipId}
              schoolName={session.schoolName}
            />
            <div className="ml-auto">
              <UserMenu user={session.me.user} />
            </div>
          </header>
          <main id="main" className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 md:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </SessionContext.Provider>
  );
}
