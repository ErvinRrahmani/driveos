import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { ConnectivityListener } from './network';
import type { PushDeps } from './push';
import type { KeyValueStorage } from './storage';

export const plainStorage: KeyValueStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

const keychainStorage: KeyValueStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

export const secureStorage: KeyValueStorage =
  Platform.OS === 'web' ? plainStorage : keychainStorage;

export function addConnectivityListener(listener: ConnectivityListener): () => void {
  return NetInfo.addEventListener(listener);
}

export function deviceLanguageCodes(): string[] {
  return getLocales().map((locale) => locale.languageCode ?? '');
}

export function deviceLocaleTag(): string {
  return getLocales()[0]?.languageTag ?? 'en';
}

async function requestPermission(): Promise<boolean> {
  const Notifications = await import('expo-notifications');
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

async function getExpoPushToken(): Promise<string> {
  const extra: unknown = Constants.expoConfig?.extra;
  const projectId =
    typeof extra === 'object' && extra !== null && 'eas' in extra
      ? (extra.eas as { projectId?: string }).projectId
      : undefined;
  const Notifications = await import('expo-notifications');
  const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return token.data;
}

export function devicePushDeps(): Pick<
  PushDeps,
  'os' | 'isDevice' | 'locale' | 'requestPermission' | 'getExpoPushToken'
> {
  return {
    os: Platform.OS,
    isDevice: Device.isDevice,
    locale: deviceLocaleTag(),
    requestPermission,
    getExpoPushToken,
  };
}
