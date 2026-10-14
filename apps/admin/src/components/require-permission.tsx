import type { ReactNode } from 'react';
import { ForbiddenState } from '@/components/states';
import { useCan } from '@/hooks/use-session';
import type { Permission } from '@/lib/permissions';

export function RequirePermission({
  anyOf,
  children,
}: {
  anyOf: Permission[];
  children: ReactNode;
}) {
  return useCan(...anyOf) ? children : <ForbiddenState />;
}
