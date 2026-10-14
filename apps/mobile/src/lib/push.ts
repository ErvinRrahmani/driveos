import type { RegisterDeviceRequest } from '@driveos/shared';

export type PushStrategy = 'expo' | 'fake';

export interface PushDeps {
  os: string;
  isDevice: boolean;
  userId: string;
  locale: string;
  requestPermission(): Promise<boolean>;
  getExpoPushToken(): Promise<string>;
  register(body: RegisterDeviceRequest): Promise<void>;
}

export type PushResult =
  | { status: 'registered'; token: string; fake: boolean }
  | { status: 'denied' }
  | { status: 'failed' };

export function choosePushStrategy({ os, isDevice }: Pick<PushDeps, 'os' | 'isDevice'>) {
  return isDevice && (os === 'ios' || os === 'android') ? 'expo' : 'fake';
}

export function fakePushToken(os: string, userId: string): string {
  return `dev-${os}-${userId}`;
}

function apiPlatform(os: string): RegisterDeviceRequest['platform'] {
  return os === 'ios' ? 'ios' : 'android';
}

export async function registerPush(deps: PushDeps): Promise<PushResult> {
  try {
    const strategy = choosePushStrategy(deps);
    if (strategy === 'expo' && !(await deps.requestPermission())) return { status: 'denied' };
    const token =
      strategy === 'expo' ? await deps.getExpoPushToken() : fakePushToken(deps.os, deps.userId);
    await deps.register({
      platform: apiPlatform(deps.os),
      pushToken: token,
      locale: deps.locale.length >= 2 ? deps.locale : 'en',
    });
    return { status: 'registered', token, fake: strategy === 'fake' };
  } catch {
    return { status: 'failed' };
  }
}
