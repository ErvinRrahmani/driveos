import { onlineManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { bindOnlineManager, isOnline, type ConnectivityState } from '../../src/lib/network';

describe('isOnline', () => {
  it('is online when connected and the internet is reachable', () => {
    expect(isOnline({ isConnected: true, isInternetReachable: true })).toBe(true);
  });

  it('is offline when disconnected or the internet is unreachable', () => {
    expect(isOnline({ isConnected: false, isInternetReachable: null })).toBe(false);
    expect(isOnline({ isConnected: true, isInternetReachable: false })).toBe(false);
  });

  it('assumes online while reachability is still unknown', () => {
    expect(isOnline({ isConnected: true, isInternetReachable: null })).toBe(true);
    expect(isOnline({ isConnected: null, isInternetReachable: null })).toBe(true);
  });
});

describe('bindOnlineManager', () => {
  afterEach(() => onlineManager.setOnline(true));

  it('drives the query online manager from connectivity events', () => {
    let emit: (state: ConnectivityState) => void = () => undefined;
    let unsubscribed = false;
    const unbind = bindOnlineManager((listener) => {
      emit = listener;
      return () => {
        unsubscribed = true;
      };
    });
    emit({ isConnected: false, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);
    emit({ isConnected: true, isInternetReachable: true });
    expect(onlineManager.isOnline()).toBe(true);
    unbind();
    expect(unsubscribed).toBe(true);
  });
});
