import type { RegisterDeviceRequest } from '@driveos/shared';
import { describe, expect, it, vi } from 'vitest';
import { choosePushStrategy, registerPush, type PushDeps } from '../../src/lib/push';

const USER = '0192f000-0002-7000-8000-000000000006';

function deps(overrides: Partial<PushDeps> = {}) {
  const registered: RegisterDeviceRequest[] = [];
  const all: PushDeps = {
    os: 'ios',
    isDevice: true,
    userId: USER,
    locale: 'en-US',
    requestPermission: vi.fn(async () => true),
    getExpoPushToken: vi.fn(async () => 'ExponentPushToken[abc]'),
    register: vi.fn(async (body: RegisterDeviceRequest) => {
      registered.push(body);
    }),
    ...overrides,
  };
  return { all, registered };
}

describe('choosePushStrategy', () => {
  it('uses the Expo push token on a physical phone', () => {
    expect(choosePushStrategy({ os: 'ios', isDevice: true })).toBe('expo');
    expect(choosePushStrategy({ os: 'android', isDevice: true })).toBe('expo');
  });

  it('uses a fake token on simulators and the web', () => {
    expect(choosePushStrategy({ os: 'ios', isDevice: false })).toBe('fake');
    expect(choosePushStrategy({ os: 'web', isDevice: true })).toBe('fake');
  });
});

describe('registerPush', () => {
  it('registers a deterministic fake token on a simulator without asking for permission', async () => {
    const { all, registered } = deps({ isDevice: false });
    const result = await registerPush(all);
    expect(result).toEqual({ status: 'registered', token: `dev-ios-${USER}`, fake: true });
    expect(registered).toEqual([
      { platform: 'ios', pushToken: `dev-ios-${USER}`, locale: 'en-US' },
    ]);
    expect(all.requestPermission).not.toHaveBeenCalled();
  });

  it('registers the web as an android device with a web fake token', async () => {
    const { all, registered } = deps({ os: 'web' });
    await registerPush(all);
    expect(registered[0]).toEqual({
      platform: 'android',
      pushToken: `dev-web-${USER}`,
      locale: 'en-US',
    });
  });

  it('registers the Expo push token on a device once permission is granted', async () => {
    const { all, registered } = deps({ os: 'android' });
    const result = await registerPush(all);
    expect(result).toEqual({ status: 'registered', token: 'ExponentPushToken[abc]', fake: false });
    expect(registered).toEqual([
      { platform: 'android', pushToken: 'ExponentPushToken[abc]', locale: 'en-US' },
    ]);
  });

  it('skips registration when the user denies notifications', async () => {
    const { all, registered } = deps({ requestPermission: async () => false });
    expect(await registerPush(all)).toEqual({ status: 'denied' });
    expect(registered).toEqual([]);
  });

  it('never throws when the platform or the API fails', async () => {
    const failing = deps({
      getExpoPushToken: () => Promise.reject(new Error('no projectId')),
    });
    expect(await registerPush(failing.all)).toEqual({ status: 'failed' });
    const rejected = deps({ register: () => Promise.reject(new Error('500')) });
    expect(await registerPush(rejected.all)).toEqual({ status: 'failed' });
  });

  it('falls back to en when the device locale is missing', async () => {
    const { all, registered } = deps({ isDevice: false, locale: '' });
    await registerPush(all);
    expect(registered[0]?.locale).toBe('en');
  });
});
