import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

export interface ConnectivityState {
  isConnected: boolean | null;
  isInternetReachable?: boolean | null;
}

export type ConnectivityListener = (state: ConnectivityState) => void;

export function isOnline(state: ConnectivityState): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

export function bindOnlineManager(
  addListener: (listener: ConnectivityListener) => () => void,
): () => void {
  let unsubscribe: () => void = () => undefined;
  onlineManager.setEventListener((setOnline) => {
    unsubscribe = addListener((state) => setOnline(isOnline(state)));
    return unsubscribe;
  });
  return () => {
    unsubscribe();
    onlineManager.setEventListener(() => undefined);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
    () => true,
  );
}
