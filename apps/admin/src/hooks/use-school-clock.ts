import { useServices } from './use-services';

export function useSchoolClock() {
  const { api } = useServices();
  const school = api.$api.useQuery('get', '/v1/school');
  const settings = api.$api.useQuery('get', '/v1/school/settings');
  return {
    timeZone: school.data?.timeZone,
    cancellationWindowHours: settings.data?.cancellationWindowHours,
    status: school.status,
    error: school.error,
    refetch: school.refetch,
  };
}
