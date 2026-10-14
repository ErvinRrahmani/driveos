import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { AppState } from 'react-native';
import { useOnline } from '../network';
import { useActiveMembership, useServices } from '../session';
import type { DiaryScope } from './diary';
import type { DiaryReader } from './store';
import type { DiarySyncSnapshot } from './sync';
import { unsyncedWarning, type UnsyncedWarning } from './unsynced';

const DiaryContext = createContext<DiaryScope | null>(null);

function useSyncTriggers(scope: DiaryScope | null) {
  const online = useOnline();
  useEffect(() => {
    if (scope) void scope.sync.sync();
  }, [scope, online]);
  useEffect(() => {
    if (!scope) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void scope.sync.sync();
    });
    return () => subscription.remove();
  }, [scope]);
}

export function DiaryProvider({ children }: { children: ReactNode }) {
  const { diary } = useServices();
  const membershipId = useActiveMembership()?.membershipId;
  const scope = membershipId ? diary.forScope(membershipId) : null;
  useSyncTriggers(scope);
  return <DiaryContext.Provider value={scope}>{children}</DiaryContext.Provider>;
}

export function useDiary(): DiaryScope {
  const scope = useContext(DiaryContext);
  if (!scope) throw new Error('useDiary must be used inside DiaryProvider with a school');
  return scope;
}

export function useOptionalDiary(): DiaryScope | null {
  return useContext(DiaryContext);
}

const IDLE: DiarySyncSnapshot = { status: 'idle', pending: 0, conflicts: 0, lastSyncedAt: null };
const noSubscription = () => () => undefined;

export function useDiarySyncStatus(): DiarySyncSnapshot {
  const scope = useOptionalDiary();
  return useSyncExternalStore(
    scope ? scope.sync.subscribe : noSubscription,
    scope ? scope.sync.getSnapshot : () => IDLE,
    scope ? scope.sync.getSnapshot : () => IDLE,
  );
}

export interface DiaryData<T> {
  data: T | undefined;
  failed: boolean;
}

export function useDiaryData<T>(
  key: string,
  read: (reader: DiaryReader) => Promise<T>,
): DiaryData<T> {
  const scope = useDiary();
  const revision = useSyncExternalStore(scope.subscribeData, scope.revision, scope.revision);
  const [state, setState] = useState<{ token: string; data?: T; failed: boolean } | null>(null);
  const token = `${scope.scope}|${key}|${revision}`;
  useEffect(() => {
    let live = true;
    read(scope.reader()).then(
      (data) => {
        if (live) setState({ token, data, failed: false });
      },
      () => {
        if (live) setState({ token, failed: true });
      },
    );
    return () => {
      live = false;
    };
    // `read` is recreated on every render; `token` captures everything it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, scope]);
  const fresh = state?.token.startsWith(`${scope.scope}|${key}|`) ? state : null;
  return { data: fresh?.data, failed: fresh?.failed ?? false };
}

export function useUnsyncedWarning(): UnsyncedWarning | null {
  const { diary } = useServices();
  const membership = useActiveMembership();
  const scope =
    membership && membership.roles.includes('instructor')
      ? diary.forScope(membership.membershipId)
      : null;
  useEffect(() => {
    if (scope) void scope.sync.refresh();
  }, [scope]);
  const snapshot = useSyncExternalStore(
    scope ? scope.sync.subscribe : noSubscription,
    scope ? scope.sync.getSnapshot : () => IDLE,
    scope ? scope.sync.getSnapshot : () => IDLE,
  );
  return unsyncedWarning(snapshot);
}
