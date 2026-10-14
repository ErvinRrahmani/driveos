import type { TimeOff } from '@driveos/shared';
import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { reportSubmitError, useAppForm } from '@/components/form';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { formatDateTimeIn } from '@/lib/format';
import { parseMinutes, zonedToUtc } from '@/lib/zoned-time';

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;
const localDateTime = () => z.string().regex(LOCAL_DATE_TIME, { message: 'validation.dateTime' });

const timeOffSchema = z
  .object({
    start: localDateTime(),
    end: localDateTime(),
    reason: z.string().trim().max(500, 'validation.max'),
  })
  .refine((value) => value.start < value.end, {
    path: ['end'],
    message: 'validation.startBeforeEnd',
  });
type TimeOffValues = z.input<typeof timeOffSchema>;

function toInstant(local: string, timeZone: string): string {
  const [date = '', time = '00:00'] = local.split('T');
  return zonedToUtc(date, parseMinutes(time), timeZone);
}

const helper = columnHelperFor<TimeOff>();

export function TimeOffSection({
  instructorId,
  timeOff,
  timeZone,
}: {
  instructorId: string;
  timeOff: TimeOff[];
  timeZone: string;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const headingId = useId();
  const add = api.$api.useMutation('post', '/v1/instructors/{id}/time-off');
  const defaultValues: TimeOffValues = { start: '', end: '', reason: '' };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: timeOffSchema, onSubmit: timeOffSchema },
    onSubmit: async ({ value, formApi }) => {
      const parsed = timeOffSchema.parse(value);
      try {
        await add.mutateAsync({
          params: { path: { id: instructorId } },
          body: {
            start: toInstant(parsed.start, timeZone),
            end: toInstant(parsed.end, timeZone),
            reason: parsed.reason,
          },
        });
        await invalidate('/v1/instructors/{id}/availability');
        toast.success(t('timeOff.added'));
        formApi.reset();
      } catch (error) {
        reportSubmitError(form, error, t('errors.generic'));
      }
    },
  });
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('start', {
          header: t('timeOff.start'),
          cell: ({ getValue }) => formatDateTimeIn(getValue(), timeZone),
        }),
        helper.accessor('end', {
          header: t('timeOff.end'),
          cell: ({ getValue }) => formatDateTimeIn(getValue(), timeZone),
        }),
        helper.accessor('reason', { header: t('timeOff.reason') }),
      ]),
    [t, timeZone],
  );
  const sorted = [...timeOff].sort((a, b) => a.start.localeCompare(b.start));

  return (
    <section className="grid gap-4">
      <h2 id={headingId} className="text-lg font-medium">
        {t('timeOff.title')}
      </h2>
      <DataTable
        label={t('timeOff.title')}
        columns={columns}
        items={sorted}
        nextCursor={null}
        status="success"
        getRowId={(entry) => entry.id}
        emptyTitle={t('timeOff.empty')}
      />
      <form
        aria-labelledby={headingId}
        className="grid items-start gap-3 rounded-md border p-3 sm:grid-cols-[1fr_1fr_2fr_auto]"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.AppField name="start">
          {(field) => <field.DateTimeField label={t('timeOff.start')} />}
        </form.AppField>
        <form.AppField name="end">
          {(field) => <field.DateTimeField label={t('timeOff.end')} />}
        </form.AppField>
        <form.AppField name="reason">
          {(field) => <field.TextField label={t('timeOff.reason')} />}
        </form.AppField>
        <div className="sm:pt-6">
          <form.AppForm>
            <form.SubmitButton label={t('timeOff.add')} />
          </form.AppForm>
        </div>
      </form>
    </section>
  );
}
