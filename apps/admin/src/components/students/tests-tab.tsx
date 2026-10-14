import { testAttemptKindSchema, testAttemptResultSchema, type TestAttempt } from '@driveos/shared';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { reportSubmitError, useAppForm } from '@/components/form';
import { FormDialog } from '@/components/form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { useCan } from '@/hooks/use-session';
import { formatPlainDate } from '@/lib/format';
import { optionalText, requiredDate } from '@/lib/form-schemas';
import { useStudentProgress } from './progress-tab';

const KINDS = testAttemptKindSchema.options;
const RESULTS = testAttemptResultSchema.options;

const helper = columnHelperFor<TestAttempt>();

export function TestsTab({ studentId }: { studentId: string }) {
  const { t } = useTranslation();
  const canRecord = useCan('test_attempts.write');
  const progress = useStudentProgress(studentId);
  const [adding, setAdding] = useState(false);
  const attempts = useMemo(
    () => progress.data?.testAttempts.toSorted((a, b) => b.takenOn.localeCompare(a.takenOn)),
    [progress.data],
  );
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('takenOn', {
          header: t('testAttempts.date'),
          cell: ({ getValue }) => formatPlainDate(getValue()),
        }),
        helper.accessor('kind', {
          header: t('testAttempts.kind'),
          cell: ({ getValue }) => t(`testAttempts.kinds.${getValue()}`),
        }),
        helper.accessor('result', {
          header: t('testAttempts.result'),
          cell: ({ getValue }) => (
            <Badge variant={getValue() === 'passed' ? 'secondary' : 'destructive'}>
              {t(`testAttempts.results.${getValue()}`)}
            </Badge>
          ),
        }),
        helper.accessor('notes', {
          header: t('testAttempts.notes'),
          cell: ({ getValue }) => getValue() || '—',
        }),
      ]),
    [t],
  );
  return (
    <section className="space-y-3">
      <div className="flex justify-end">
        {canRecord && (
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            {t('testAttempts.add')}
          </Button>
        )}
      </div>
      <DataTable
        label={t('testAttempts.title')}
        columns={columns}
        items={attempts}
        nextCursor={null}
        status={progress.status}
        error={progress.error}
        onRetry={() => void progress.refetch()}
        getRowId={(attempt) => attempt.id}
        emptyTitle={t('testAttempts.empty')}
      />
      <FormDialog open={adding} onOpenChange={setAdding} title={t('testAttempts.addTitle')}>
        <TestAttemptForm studentId={studentId} onDone={() => setAdding(false)} />
      </FormDialog>
    </section>
  );
}

const attemptSchema = z.object({
  kind: z.enum(KINDS),
  takenOn: requiredDate(),
  result: z.enum(RESULTS),
  notes: optionalText(2000),
});
type AttemptValues = z.input<typeof attemptSchema>;

function TestAttemptForm({ studentId, onDone }: { studentId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const record = api.$api.useMutation('post', '/v1/students/{id}/test-attempts');
  const defaultValues: AttemptValues = { kind: 'theory', takenOn: '', result: 'passed', notes: '' };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: attemptSchema, onSubmit: attemptSchema },
    onSubmit: async ({ value }) => {
      try {
        await record.mutateAsync({
          params: { path: { id: studentId } },
          body: attemptSchema.parse(value),
        });
        await invalidate('/v1/students/{id}/progress');
        toast.success(t('testAttempts.saved'));
        onDone();
      } catch (error) {
        reportSubmitError(form, error, t('errors.generic'));
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
      <div className="grid grid-cols-2 gap-4">
        <form.AppField name="kind">
          {(field) => (
            <field.SelectField
              label={t('testAttempts.kind')}
              options={KINDS.map((kind) => ({
                value: kind,
                label: t(`testAttempts.kinds.${kind}`),
              }))}
            />
          )}
        </form.AppField>
        <form.AppField name="takenOn">
          {(field) => <field.DateField label={t('testAttempts.date')} />}
        </form.AppField>
      </div>
      <form.AppField name="result">
        {(field) => (
          <field.SelectField
            label={t('testAttempts.result')}
            options={RESULTS.map((result) => ({
              value: result,
              label: t(`testAttempts.results.${result}`),
            }))}
          />
        )}
      </form.AppField>
      <form.AppField name="notes">
        {(field) => <field.TextField label={t('testAttempts.notes')} />}
      </form.AppField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <form.AppForm>
          <form.SubmitButton label={t('common.save')} />
        </form.AppForm>
      </DialogFooter>
    </form>
  );
}
