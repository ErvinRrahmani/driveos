import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { chooseSchool } from '../lib/login-flow';
import { useServices } from '../lib/session';
import { errorMessage } from './error-message';

export function useSchoolSwitch() {
  const services = useServices();
  const router = useRouter();
  const { t } = useTranslation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (membershipId: string) => {
    setBusyId(membershipId);
    setError(null);
    const result = await chooseSchool(services, membershipId);
    setBusyId(null);
    if (result.ok) router.replace(result.next);
    else setError(errorMessage(t, result));
  };

  return { busyId, error, choose };
}
