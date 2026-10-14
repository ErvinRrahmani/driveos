import { createSlotOfferRequestSchema } from '@driveos/shared';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, useAppForm } from '@/components/form';
import { DialogFooter } from '@/components/ui/dialog';
import { useInvalidate } from '@/hooks/use-invalidate';
import {
  useInstructors,
  useLessonTypes,
  useStudentOptions,
  useVehicles,
} from '@/hooks/use-scheduling-options';
import { useServices } from '@/hooks/use-services';
import { apiErrorCode } from '@/lib/api-errors';
import { timeOfDay } from '@/lib/form-schemas';
import { parseMinutes, zonedToUtc } from '@/lib/zoned-time';

const requiredId = z
  .string()
  .nullable()
  .refine((value) => !!value, { message: 'validation.required' });

const baseSchema = z.object({
  instructorMembershipId: requiredId,
  lessonTypeId: requiredId,
  vehicleId: z.string().nullable(),
  date: z.iso.date({ error: 'validation.date' }),
  time: timeOfDay(),
  studentIds: z.array(z.string()),
});
type SlotOfferValues = z.input<typeof baseSchema>;

const EXPLAINED_CONFLICTS = [
  'no_eligible_students',
  'slot_unavailable',
  'lesson_conflict',
] as const;
type ExplainedConflict = (typeof EXPLAINED_CONFLICTS)[number];

function explainedConflict(error: unknown): ExplainedConflict | undefined {
  const code = apiErrorCode(error);
  return EXPLAINED_CONFLICTS.find((candidate) => candidate === code);
}

export function SlotOfferForm({
  timeZone,
  today,
  onDone,
}: {
  timeZone: string;
  today: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const instructors = useInstructors();
  const lessonTypes = useLessonTypes();
  const vehicles = useVehicles();
  const students = useStudentOptions('');
  const create = api.$api.useMutation('post', '/v1/slot-offers');
  const schema = useMemo(
    () =>
      baseSchema.superRefine((value, ctx) => {
        if (lessonTypes.byId(value.lessonTypeId)?.requiresVehicle && !value.vehicleId) {
          ctx.addIssue({ code: 'custom', path: ['vehicleId'], message: 'validation.required' });
        }
      }),
    [lessonTypes],
  );
  const defaultValues: SlotOfferValues = {
    instructorMembershipId: null,
    lessonTypeId: null,
    vehicleId: null,
    date: today,
    time: '09:00',
    studentIds: [],
  };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: async ({ value }) => {
      const parsed = schema.parse(value);
      const type = lessonTypes.byId(parsed.lessonTypeId);
      try {
        const body = createSlotOfferRequestSchema.parse({
          instructorMembershipId: parsed.instructorMembershipId,
          lessonTypeId: parsed.lessonTypeId,
          vehicleId: type?.requiresVehicle ? (parsed.vehicleId ?? undefined) : undefined,
          start: zonedToUtc(parsed.date, parseMinutes(parsed.time), timeZone),
          studentIds: parsed.studentIds.length > 0 ? parsed.studentIds : undefined,
        });
        await create.mutateAsync({ body });
        await invalidate('/v1/slot-offers');
        toast.success(t('slotOffers.created'));
        onDone();
      } catch (error) {
        const conflict = explainedConflict(error);
        if (conflict) toast.error(t(`slotOffers.errors.${conflict}`));
        else reportSubmitError(form, error, t('errors.generic'));
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
      <form.AppField name="instructorMembershipId">
        {(field) => (
          <field.SelectField
            label={t('slotOffers.instructor')}
            options={instructors.options}
            emptyLabel={t('booking.pickInstructor')}
          />
        )}
      </form.AppField>
      <form.AppField name="lessonTypeId">
        {(field) => (
          <field.SelectField
            label={t('slotOffers.lessonType')}
            options={lessonTypes.options}
            emptyLabel={t('booking.pickLessonType')}
          />
        )}
      </form.AppField>
      <form.Subscribe selector={(state) => state.values.lessonTypeId}>
        {(lessonTypeId) =>
          lessonTypes.byId(lessonTypeId)?.requiresVehicle ? (
            <form.AppField name="vehicleId">
              {(field) => (
                <field.SelectField
                  label={t('slotOffers.vehicle')}
                  options={vehicles.options}
                  emptyLabel={t('booking.noVehicle')}
                />
              )}
            </form.AppField>
          ) : null
        }
      </form.Subscribe>
      <div className="grid gap-4 sm:grid-cols-2">
        <form.AppField name="date">
          {(field) => <field.DateField label={t('slotOffers.date')} />}
        </form.AppField>
        <form.AppField name="time">
          {(field) => <field.TimeField label={t('slotOffers.start')} />}
        </form.AppField>
      </div>
      <form.AppField name="studentIds">
        {(field) => (
          <field.CheckboxGroupField
            label={t('slotOffers.studentsLabel')}
            description={t('slotOffers.studentsHint')}
            options={students.options}
          />
        )}
      </form.AppField>
      <DialogFooter>
        <form.AppForm>
          <form.SubmitButton label={t('common.save')} />
        </form.AppForm>
      </DialogFooter>
    </form>
  );
}
