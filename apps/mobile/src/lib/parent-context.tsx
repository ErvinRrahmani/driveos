import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import { type ApiFailure, NETWORK_ERROR } from './api-errors';
import { chooseStudent, type LinkedStudent, resolveLinkedStudents } from './parent-students';
import { createPendingConsents } from './pending-consent';
import { plainStorage } from './platform';
import { PERSIST } from './query';
import { useMe, useServices } from './session';
import { CALENDAR_DAYS_AHEAD, CALENDAR_DAYS_BACK, useDayWindow } from './student-data';
import { parentScope, StudentScopeProvider } from './student-scope';

export const LINKED_STUDENTS_KEY = ['parent', 'linkedStudents'] as const;

function queryError(failure: ApiFailure): unknown {
  if (failure.code === NETWORK_ERROR) return new TypeError('Network request failed');
  return { error: { code: failure.code, message: failure.message ?? '' } };
}

export function useLinkedStudentsQuery(enabled: boolean) {
  const services = useServices();
  const window = useDayWindow(CALENDAR_DAYS_BACK, CALENDAR_DAYS_AHEAD);
  return useQuery({
    queryKey: LINKED_STUDENTS_KEY,
    queryFn: async () => {
      const result = await resolveLinkedStudents(services, window);
      if (!result.ok) throw queryError(result);
      return { students: result.students, complete: result.complete };
    },
    enabled,
    meta: PERSIST,
  });
}

interface ParentStudents {
  query: ReturnType<typeof useLinkedStudentsQuery>;
  students: LinkedStudent[];
  selected: LinkedStudent | null;
  select: (id: string) => void;
}

const ParentStudentsContext = createContext<ParentStudents | null>(null);

export function ParentStudentsProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const query = useLinkedStudentsQuery(enabled);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const students = useMemo(() => query.data?.students ?? [], [query.data]);
  const selected = chooseStudent(students, selectedId);
  const scope = useMemo(() => parentScope(selected?.id), [selected?.id]);
  const value = useMemo(
    () => ({ query, students, selected, select: setSelectedId }),
    [query, students, selected],
  );
  return (
    <ParentStudentsContext.Provider value={value}>
      <StudentScopeProvider scope={scope}>{children}</StudentScopeProvider>
    </ParentStudentsContext.Provider>
  );
}

export function useParentStudents(): ParentStudents {
  const value = useContext(ParentStudentsContext);
  if (!value) throw new Error('useParentStudents needs a ParentStudentsProvider');
  return value;
}

export function useRefreshLinkedStudents() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: LINKED_STUDENTS_KEY });
}

export function useHasConversations(enabled: boolean): boolean {
  const { api } = useServices();
  const conversations = api.$api.useQuery(
    'get',
    '/v1/conversations',
    { params: { query: { limit: 50 } } },
    { enabled },
  );
  return (conversations.data?.items.length ?? 0) > 0;
}

export const pendingConsents = createPendingConsents(plainStorage);

export const PENDING_CONSENT_KEY = ['parent', 'pendingConsent'] as const;

export function usePendingConsents() {
  const userId = useMe().data?.user.id;
  const query = useQuery({
    queryKey: [...PENDING_CONSENT_KEY, userId],
    queryFn: () => pendingConsents.list(userId ?? ''),
    enabled: userId !== undefined,
  });
  return { userId, links: query.data ?? [] };
}
