import type { CalendarResponse, LessonResponse, MoveLessonRequest } from '@driveos/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useServices } from '@/hooks/use-services';

export interface CalendarFilters {
  from: string;
  to: string;
  instructorId?: string;
  vehicleId?: string;
  studentId?: string;
}

const CALENDAR_PREFIX = ['get', '/v1/calendar'] as const;

export function useCalendarLessons(filters: CalendarFilters) {
  const { api } = useServices();
  return useQuery({
    queryKey: [...CALENDAR_PREFIX, { params: { query: filters } }],
    queryFn: async ({ signal }): Promise<CalendarResponse> => {
      const items: LessonResponse[] = [];
      let cursor: string | undefined;
      do {
        const { data, error } = await api.fetchClient.GET('/v1/calendar', {
          params: { query: { ...filters, cursor, limit: 200 } },
          signal,
        });
        if (error) throw error;
        items.push(...data.items);
        cursor = data.nextCursor ?? undefined;
      } while (cursor);
      return { items, nextCursor: null };
    },
    placeholderData: keepPreviousData,
  });
}

export interface MoveInput {
  lesson: LessonResponse;
  change: Omit<MoveLessonRequest, 'version'>;
  preview: LessonResponse;
  columnKey: string;
}

export function useMoveLesson({
  onSuccess,
  onError,
}: {
  onSuccess: () => void;
  onError: (error: unknown, input: MoveInput) => void;
}) {
  const { api, queryClient } = useServices();
  const replaceLesson = (id: string, update: (lesson: LessonResponse) => LessonResponse) =>
    queryClient.setQueriesData<CalendarResponse>({ queryKey: CALENDAR_PREFIX }, (data) =>
      data
        ? { ...data, items: data.items.map((item) => (item.id === id ? update(item) : item)) }
        : data,
    );
  return useMutation({
    mutationFn: async ({ lesson, change }: MoveInput) => {
      const { data, error } = await api.fetchClient.PATCH('/v1/lessons/{id}', {
        params: { path: { id: lesson.id } },
        body: { ...change, version: lesson.version },
      });
      if (error) throw error;
      return data;
    },
    onMutate: async ({ lesson, preview }) => {
      await queryClient.cancelQueries({ queryKey: CALENDAR_PREFIX });
      const snapshot = queryClient.getQueriesData<CalendarResponse>({ queryKey: CALENDAR_PREFIX });
      replaceLesson(lesson.id, () => preview);
      return { snapshot };
    },
    onSuccess: (result, { lesson }) => {
      replaceLesson(lesson.id, (current) => ({ ...current, version: result.version }));
      onSuccess();
    },
    onError: (error, input, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
      onError(error, input);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: CALENDAR_PREFIX }),
  });
}
