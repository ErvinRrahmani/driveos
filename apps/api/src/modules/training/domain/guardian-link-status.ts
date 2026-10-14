import type { GuardianLinkStatus } from '@driveos/shared';

export function guardianLinkStatus(link: {
  consentAt: Date | null;
  minor: boolean;
}): GuardianLinkStatus {
  if (link.consentAt) return 'consented';
  return link.minor ? 'pending_consent' : 'not_required';
}
