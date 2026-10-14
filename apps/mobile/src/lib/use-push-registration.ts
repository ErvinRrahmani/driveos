import { useEffect } from 'react';
import { devicePushDeps } from './platform';
import { registerPush } from './push';
import { useMe, useServices } from './session';

const registered = new Set<string>();

export function usePushRegistration() {
  const { api } = useServices();
  const userId = useMe().data?.user.id;
  useEffect(() => {
    if (!userId || registered.has(userId)) return;
    registered.add(userId);
    void registerPush({
      ...devicePushDeps(),
      userId,
      register: async (body) => {
        const { response } = await api.fetchClient.POST('/v1/devices', { body });
        if (!response.ok) throw new Error(`device registration failed with ${response.status}`);
      },
    }).then((result) => {
      if (result.status === 'failed') registered.delete(userId);
    });
  }, [api, userId]);
}
