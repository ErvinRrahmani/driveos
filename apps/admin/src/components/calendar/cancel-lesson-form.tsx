import type { LessonResponse } from '@driveos/shared';
import { useMutation } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, useAppForm } from '@/components/form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { useServices } from '@/hooks/use-services';
import { isLateCancel, zonedRange } from '@/lib/calendar';
import { formatPlainDay } from '@/lib/format';

const cancelSchema = z.object({
  reason: z.string().trim().max(500, 'validation.max'),
  credit: z.enum(['restore', 'keep']),
});
type CancelValues = z.input<typeof cancelSchema>;

export function CancelLessonForm({
  lesson,
  timeZone,
  windowHours,
  canKeepCredit,
  onDone,
  onKeep,
}: {
  lesson: LessonResponse;
  timeZone: string;
  windowHours: number;
  canKeepCredit: boolean;
  onDone: () => void;
  onKeep: () => void;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const [late] = useState(() => isLateCancel(lesson.start, new Date(), windowHours));
  const cancel = useMutation({
    mutationFn: async ({ reason, keepCredit }: { reason?: string; keepCredit: boolean }) => {
      const { data, error } = await api.fetchClient.POST('/v1/lessons/{id}/cancel', {
        params: { path: { id: lesson.id } },
        body: {
          reason,
          version: lesson.version,
          ...(keepCredit ? { restoreCredit: false } : {}),
        },
      });
      if (error) throw error;
      return data;
    },
  });

  const defaultValues: CancelValues = { reason: '', credit: 'restore' };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: cancelSchema, onSubmit: cancelSchema },
    onSubmit: async ({ value }) => {
      const parsed = cancelSchema.parse(value);
      let result;
      try {
        result = await cancel.mutateAsync({
          reason: parsed.reason || undefined,
          keepCredit: late && canKeepCredit && parsed.credit === 'keep',
        });
      } catch (error) {
        reportSubmitError(form, error, t('errors.generic'));
        return;
      }
      if (result.late) toast.success(t('cancelLesson.cancelledLate'));
      else if (result.minutesRestored > 0)
        toast.success(t('cancelLesson.restored', { minutes: result.minutesRestored }));
      else toast.success(t('cancelLesson.cancelled'));
      onDone();
    },
  });

  const range = zonedRange(lesson.start, lesson.end, timeZone);
  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <p className="text-sm">
        {t('cancelLesson.summary', {
          student: lesson.studentName,
          day: formatPlainDay(range.day),
          range: range.label,
        })}
      </p>
      {late && (
        <Alert variant="destructive" role="note">
          <TriangleAlert aria-hidden />
          <AlertTitle>{t('cancelLesson.lateTitle')}</AlertTitle>
          <AlertDescription>
            {t('cancelLesson.lateBody', { hours: windowHours, minutes: lesson.creditMinutes })}
          </AlertDescription>
        </Alert>
      )}
      <form.AppField name="reason">
        {(field) => <field.TextField label={t('cancelLesson.reason')} />}
      </form.AppField>
      {late && canKeepCredit && (
        <form.AppField name="credit">
          {(field) => (
            <field.SelectField
              label={t('cancelLesson.credit')}
              description={t('cancelLesson.keepHint')}
              options={[
                { value: 'restore', label: t('cancelLesson.giveBack') },
                { value: 'keep', label: t('cancelLesson.keepCredit') },
              ]}
            />
          )}
        </form.AppField>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onKeep}>
          {t('cancelLesson.keep')}
        </Button>
        <form.AppForm>
          <form.SubmitButton label={t('cancelLesson.confirm')} />
        </form.AppForm>
      </DialogFooter>
    </form>
  );
}
