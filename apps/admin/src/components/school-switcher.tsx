import type { MembershipSummary } from '@driveos/shared';
import { ChevronsUpDown, School } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSwitchSchool } from '@/hooks/use-switch-school';

export function RoleList({ roles }: { roles: readonly string[] }) {
  const { t } = useTranslation();
  return roles.map((role) => t(`roles.${role}` as 'roles.owner')).join(', ');
}

export function SchoolSwitcher({
  memberships,
  activeMembershipId,
  schoolName,
}: {
  memberships: MembershipSummary[];
  activeMembershipId: string;
  schoolName: string;
}) {
  const { t } = useTranslation();
  const { switchTo, isPending } = useSwitchSchool();
  const choices = memberships.filter((membership) => membership.status === 'active');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="max-w-xs justify-between" disabled={isPending}>
          <School aria-hidden />
          <span className="truncate">{schoolName}</span>
          <ChevronsUpDown aria-hidden className="opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t('shell.switchSchool')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={activeMembershipId}
          onValueChange={(membershipId) => {
            if (membershipId !== activeMembershipId) void switchTo(membershipId);
          }}
        >
          {choices.map((membership) => (
            <DropdownMenuRadioItem key={membership.membershipId} value={membership.membershipId}>
              <span className="flex flex-col">
                <span>{membership.schoolName}</span>
                <span className="text-muted-foreground text-xs">
                  <RoleList roles={membership.roles} />
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
