import * as Device from 'expo-device';
import type { NotificationResponse } from 'expo-notifications';
import { type Href, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { choosePushStrategy } from './push';

export function usePushResponse(target: (data: unknown) => string | null) {
  const router = useRouter();
  useEffect(() => {
    if (choosePushStrategy({ os: Platform.OS, isDevice: Device.isDevice }) !== 'expo') return;
    let live = true;
    let remove: (() => void) | null = null;
    void import('expo-notifications').then((Notifications) => {
      if (!live) return;
      const open = (response: NotificationResponse) => {
        const href = target(response.notification.request.content.data);
        if (href) router.push(href as Href);
      };
      const subscription = Notifications.addNotificationResponseReceivedListener(open);
      remove = () => subscription.remove();
      const last = Notifications.getLastNotificationResponse();
      if (last) {
        Notifications.clearLastNotificationResponse();
        open(last);
      }
    });
    return () => {
      live = false;
      remove?.();
    };
  }, [router, target]);
}
