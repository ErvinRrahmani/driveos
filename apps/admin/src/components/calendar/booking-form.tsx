import type { LessonResponse } from '@driveos/shared';
import { useMutation } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, useAppForm } from '@/components/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useIdempotencyKey } from '@/hooks/use-idempotency-key';
import {
  useInstructors,
  useLessonTypes,
  useStudentOptions,
  useVehicles,
} from '@/hooks/use-scheduling-options';
import { useServices } from '@/hooks/use-services';
import { apiErrorCode } from '@/lib/api-errors';
import { conflictPeriod, zonedRange } from '@/lib/calendar';
import { timeOfDay } from '@/lib/form-schemas';
import { formatPlainDay } from '@/lib/format';
import { parseMinutes, zonedToUtc } from '@/lib/zoned-time';

export interface BookingPrefill {
  date: string;
  time: string;
  studentId?: string | null;
  lessonTypeId?: string | null;
  instructorMembershipId?: string | null;
  vehicleId?: string | null;
}

const requiredId = z
  .string()
  .nullable()
  .refine((value) => !!value, { message: 'validation.required' });

const baseSchema = z.object({
  studentId: requiredId,
  lessonTypeId: requiredId,
  instructorMembershipId: requiredId,
  vehicleId: z.string().nullable(),
  date: z.iso.date({ error: 'validation.date' }),
  time: timeOfDay(),
  pickupAddress: z.string().trim().max(500, 'validation.max'),
});
type BookingValues = z.input<typeof baseSchema>;

export function BookingForm({
  prefill,
  timeZone,
  knownLessons,
  onBooked,
}: {
  prefill: BookingPrefill;
  timeZone: string;
  knownLessons: LessonResponse[];
  onBooked: (lesson: LessonResponse) => void;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const [search, setSearch] = useState('');
  const students = useStudentOptions(search);
  const lessonTypes = useLessonTypes();
  const instructors = useInstructors();
  const vehicles = useVehicles();
  const idempotency = useIdempotencyKey();
  const book = useMutation({
    mutationFn: async (body: {
      studentId: string;
      lessonTypeId: string;
      instructorMembershipId: string;
      vehicleId: string | null;
      start: string;
      pickupAddress?: string;
    }) => {
      const { data, error, response } = await api.fetchClient.POST('/v1/lessons', {
        params: { header: { 'Idempotency-Key': idempotency.current() } },
        body,
      });
      idempotency.settle(response.status);
      if (error) throw error;
      return data;
    },
  });

  const schema = useMemo(
    () =>
      baseSchema.superRefine((value, ctx) => {
        if (lessonTypes.byId(value.lessonTypeId)?.requiresVehicle && !value.vehicleId) {
          ctx.addIssue({ code: 'custom', path: ['vehicleId'], message: 'validation.required' });
        }
      }),
    [lessonTypes],
  );

  const defaultValues: BookingValues = {
    studentId: prefill.studentId ?? null,
    lessonTypeId: prefill.lessonTypeId ?? null,
    instructorMembershipId: prefill.instructorMembershipId ?? null,
    vehicleId: prefill.vehicleId ?? null,
    date: prefill.date,
    time: prefill.time,
    pickupAddress: '',
  };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: async ({ value }) => {
      const parsed = schema.parse(value);
      const type = lessonTypes.byId(parsed.lessonTypeId);
      try {
        const lesson = await book.mutateAsync({
          studentId: parsed.studentId ?? '',
          lessonTypeId: parsed.lessonTypeId ?? '',
          instructorMembershipId: parsed.instructorMembershipId ?? '',
          vehicleId: type?.requiresVehicle ? parsed.vehicleId : null,
          start: zonedToUtc(parsed.date, parseMinutes(parsed.time), timeZone),
          pickupAddress: parsed.pickupAddress || undefined,
        });
        onBooked(lesson);
      } catch (error) {
        const period =
          apiErrorCode(error) === 'lesson_conflict' ? conflictPeriod(error, knownLessons) : null;
        if (period) {
          const range = zonedRange(period.start, period.end, timeZone);
          toast.error(
            t('booking.conflict', { day: formatPlainDay(range.day), range: range.label }),
          );
        } else {
          reportSubmitError(form, error, t('errors.generic'));
        }
      }
    },
  });

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="booking-student-search">{t('booking.searchStudents')}</Label>
        <Input
          id="booking-student-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <form.AppField name="studentId">
        {(field) => (
          <field.SelectField
            label={t('booking.student')}
            options={students.options}
            emptyLabel={t('booking.pickStudent')}
          />
        )}
      </form.AppField>
      <form.Subscribe selector={(state) => state.values.studentId}>
        {(studentId) => (studentId ? <StudentBalance studentId={studentId} /> : null)}
      </form.Subscribe>
      <form.AppField name="lessonTypeId">
        {(field) => (
          <field.SelectField
            label={t('booking.lessonType')}
            options={lessonTypes.options}
            emptyLabel={t('booking.pickLessonType')}
          />
        )}
      </form.AppField>
      <form.AppField name="instructorMembershipId">
        {(field) => (
          <field.SelectField
            label={t('booking.instructor')}
            options={instructors.options}
            emptyLabel={t('booking.pickInstructor')}
          />
        )}
      </form.AppField>
      <form.Subscribe selector={(state) => state.values.lessonTypeId}>
        {(lessonTypeId) => {
          const type = lessonTypes.byId(lessonTypeId);
          return (
            <>
              {type?.requiresVehicle && (
                <form.AppField name="vehicleId">
                  {(field) => (
                    <field.SelectField
                      label={t('booking.vehicle')}
                      options={vehicles.options}
                      emptyLabel={t('booking.noVehicle')}
                    />
                  )}
                </form.AppField>
              )}
              {type?.kind === 'exam' && (
                <Alert role="note">
                  <Info aria-hidden />
                  <AlertDescription>{t('booking.examHint')}</AlertDescription>
                </Alert>
              )}
            </>
          );
        }}
      </form.Subscribe>
      <div className="grid gap-4 sm:grid-cols-2">
        <form.AppField name="date">
          {(field) => <field.DateField label={t('booking.date')} />}
        </form.AppField>
        <form.AppField name="time">
          {(field) => <field.TimeField label={t('booking.start')} />}
        </form.AppField>
      </div>
      <form.AppField name="pickupAddress">
        {(field) => (
          <field.TextField label={t('booking.pickup')} description={t('booking.pickupHint')} />
        )}
      </form.AppField>
      <DialogFooter>
        <form.AppForm>
          <form.SubmitButton label={t('booking.submit')} />
        </form.AppForm>
      </DialogFooter>
    </form>
  );
}

function StudentBalance({ studentId }: { studentId: string }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const balance = api.$api.useQuery('get', '/v1/students/{id}/balance', {
    params: { path: { id: studentId } },
  });
  if (!balance.data) return null;
  return (
    <p className="text-muted-foreground -mt-2 text-xs">
      {t('booking.balance', { minutes: balance.data.balanceMinutes })}
    </p>
  );
}
