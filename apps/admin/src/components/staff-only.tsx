import type { MeResponse } from '@driveos/shared';
import { useTranslation } from 'react-i18next';
import { RoleList } from '@/components/school-switcher';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSignOut } from '@/hooks/use-sign-out';
import { useSwitchSchool } from '@/hooks/use-switch-school';
import { isStaff } from '@/lib/permissions';

export function StaffOnly({ me }: { me: MeResponse }) {
  const { t } = useTranslation();
  const signOut = useSignOut();
  const { switchTo, isPending } = useSwitchSchool();
  const staffSchools = me.memberships.filter(
    (membership) =>
      membership.status === 'active' &&
      isStaff(membership.roles) &&
      membership.membershipId !== me.active?.membershipId,
  );
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            <h1>{t('auth.staffOnlyTitle')}</h1>
          </CardTitle>
          <CardDescription>{t('auth.staffOnlyBody')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {staffSchools.map((membership) => (
            <Button
              key={membership.membershipId}
              variant="outline"
              disabled={isPending}
              onClick={() => void switchTo(membership.membershipId)}
            >
              {membership.schoolName} · <RoleList roles={membership.roles} />
            </Button>
          ))}
          <Button variant="ghost" onClick={() => void signOut()}>
            {t('auth.signOut')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
