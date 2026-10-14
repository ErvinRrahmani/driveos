import { useRouter } from 'expo-router';
import { useState } from 'react';
import { signOut } from '../lib/login-flow';
import { useServices } from '../lib/session';

export function useSignOut() {
  const services = useServices();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    await signOut(services);
    setBusy(false);
    router.replace('/login');
  };
  return { busy, signOut: run };
}
