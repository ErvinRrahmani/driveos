import type { MembershipSummary } from '@driveos/shared';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { selectableMemberships } from '../lib/route-group';
import { ListItem, spacing, Text } from '../ui';
import { roleList } from './role-label';

export interface SchoolChooserProps {
  memberships: readonly MembershipSummary[];
  activeMembershipId: string | null;
  busyMembershipId?: string | null;
  onChoose: (membershipId: string) => void;
}

export function SchoolChooser({
  memberships,
  activeMembershipId,
  busyMembershipId,
  onChoose,
}: SchoolChooserProps) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: spacing.sm }} accessibilityRole="list">
      {selectableMemberships(memberships).map((membership) => {
        const active = membership.membershipId === activeMembershipId;
        return (
          <ListItem
            key={membership.membershipId}
            title={membership.schoolName}
            subtitle={roleList(t, membership.roles)}
            selected={active}
            disabled={busyMembershipId != null}
            onPress={() => onChoose(membership.membershipId)}
            accessory={
              busyMembershipId === membership.membershipId ? (
                <Text variant="caption" tone="muted">
                  {t('schools.switching')}
                </Text>
              ) : active ? (
                <Text variant="caption" tone="primary">
                  {t('schools.current')}
                </Text>
              ) : null
            }
          />
        );
      })}
    </View>
  );
}
