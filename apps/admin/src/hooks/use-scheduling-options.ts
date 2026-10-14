import { useMemo } from 'react';
import { useServices } from './use-services';

const ALL = { limit: 200 } as const;

export function useInstructors() {
  const { api } = useServices();
  const staff = api.$api.useQuery('get', '/v1/staff', {
    params: { query: { ...ALL, role: 'instructor' } },
  });
  return useMemo(() => {
    const items = (staff.data?.items ?? []).filter((member) => member.status === 'active');
    return {
      items,
      options: items.map((member) => ({ value: member.membershipId, label: member.fullName })),
      nameOf: (id: string) => items.find((member) => member.membershipId === id)?.fullName,
      status: staff.status,
      error: staff.error,
      refetch: staff.refetch,
    };
  }, [staff.data, staff.status, staff.error, staff.refetch]);
}

export function useVehicles() {
  const { api } = useServices();
  const vehicles = api.$api.useQuery('get', '/v1/vehicles', { params: { query: ALL } });
  return useMemo(() => {
    const items = (vehicles.data?.items ?? []).filter((vehicle) => vehicle.active);
    return {
      items,
      options: items.map((vehicle) => ({ value: vehicle.id, label: vehicle.plate })),
      plateOf: (id: string) => items.find((vehicle) => vehicle.id === id)?.plate,
      status: vehicles.status,
    };
  }, [vehicles.data, vehicles.status]);
}

export function useLessonTypes() {
  const { api } = useServices();
  const types = api.$api.useQuery('get', '/v1/lesson-types', { params: { query: ALL } });
  return useMemo(() => {
    const items = types.data?.items ?? [];
    return {
      items,
      options: items
        .filter((type) => type.active)
        .map((type) => ({ value: type.id, label: type.name })),
      byId: (id: string | null | undefined) => items.find((type) => type.id === id),
      status: types.status,
    };
  }, [types.data, types.status]);
}

export function useStudentOptions(search: string) {
  const { api } = useServices();
  const q = search.trim();
  const students = api.$api.useQuery('get', '/v1/students', {
    params: { query: { ...ALL, status: 'active', q: q || undefined } },
  });
  return useMemo(
    () => ({
      items: students.data?.items ?? [],
      options: (students.data?.items ?? []).map((student) => ({
        value: student.id,
        label: student.fullName,
      })),
      isPending: students.isPending,
    }),
    [students.data, students.isPending],
  );
}
