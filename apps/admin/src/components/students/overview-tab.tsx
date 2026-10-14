import type { Enrolment, StudentResponse } from '@driveos/shared';
import { Plus, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { reportSubmitError, useAppForm } from '@/components/form';
import { FormDialog } from '@/components/form-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { useCan } from '@/hooks/use-session';
import { formatDate } from '@/lib/format';
import { optionalDate, optionalText, requiredDate, requiredText } from '@/lib/form-schemas';
import { ContactInvitationForm } from './contact-invitation-form';
import { EnrolmentForm } from './enrolment-form';
import { InstructorAssignment } from './instructor-assignment';

export function OverviewTab({ student }: { student: StudentResponse }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <DetailsCard student={student} />
      <div className="grid content-start gap-6">
        <AppAccessCard student={student} />
        <InstructorAssignment studentId={student.id} />
      </div>
      <div className="lg:col-span-2">
        <EnrolmentsCard studentId={student.id} enrolments={student.enrolments} />
      </div>
    </div>
  );
}

const detailsSchema = z.object({
  fullName: requiredText(200),
  dateOfBirth: requiredDate(),
  licenceClass: requiredText(10),
  examLanguage: requiredText(35),
  testDate: optionalDate(),
  area: optionalText(100),
  pickupAddress: optionalText(500),
});
type DetailsValues = z.input<typeof detailsSchema>;

function DetailsCard({ student }: { student: StudentResponse }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const canManage = useCan('students.manage');
  const update = api.$api.useMutation('patch', '/v1/students/{id}');
  const defaultValues: DetailsValues = {
    fullName: student.fullName,
    dateOfBirth: student.dateOfBirth,
    licenceClass: student.licenceClass,
    examLanguage: student.examLanguage,
    testDate: student.testDate ?? '',
    area: student.area ?? '',
    pickupAddress: student.pickupAddress ?? '',
  };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: detailsSchema, onSubmit: detailsSchema },
    onSubmit: async ({ value }) => {
      const parsed = detailsSchema.parse(value);
      try {
        await update.mutateAsync({
          params: { path: { id: student.id } },
          body: {
            ...parsed,
            testDate: parsed.testDate || null,
            area: parsed.area || null,
            pickupAddress: parsed.pickupAddress || null,
          },
        });
        await invalidate('/v1/students', '/v1/students/{id}');
        toast.success(t('common.saved'));
      } catch (error) {
        reportSubmitError(form, error, t('errors.generic'));
      }
    },
  });
  const disabled = !canManage || student.status === 'anonymized';
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('studentProfile.details')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.AppField name="fullName">
            {(field) => <field.TextField label={t('students.fullName')} disabled={disabled} />}
          </form.AppField>
          <div className="grid grid-cols-2 gap-4">
            <form.AppField name="dateOfBirth">
              {(field) => <field.DateField label={t('students.dateOfBirth')} disabled={disabled} />}
            </form.AppField>
            <form.AppField name="testDate">
              {(field) => <field.DateField label={t('students.testDate')} disabled={disabled} />}
            </form.AppField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <form.AppField name="licenceClass">
              {(field) => (
                <field.TextField label={t('students.licenceClass')} disabled={disabled} />
              )}
            </form.AppField>
            <form.AppField name="examLanguage">
              {(field) => (
                <field.TextField label={t('students.examLanguage')} disabled={disabled} />
              )}
            </form.AppField>
          </div>
          <form.AppField name="area">
            {(field) => <field.TextField label={t('students.area')} disabled={disabled} />}
          </form.AppField>
          <form.AppField name="pickupAddress">
            {(field) => <field.TextField label={t('students.pickupAddress')} disabled={disabled} />}
          </form.AppField>
          <dl className="text-muted-foreground grid grid-cols-2 gap-2 text-sm">
            <dt>{t('studentProfile.phone')}</dt>
            <dd>{student.phone ?? t('common.none')}</dd>
            <dt>{t('studentProfile.email')}</dt>
            <dd>{student.email ?? t('common.none')}</dd>
          </dl>
          {!disabled && (
            <div className="flex justify-end">
              <form.AppForm>
                <form.SubmitButton label={t('studentProfile.saveDetails')} />
              </form.AppForm>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function AppAccessCard({ student }: { student: StudentResponse }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const canInvite = useCan('invitations.manage');
  const [inviting, setInviting] = useState(false);
  const invitations = api.$api.useQuery(
    'get',
    '/v1/invitations',
    { params: { query: { limit: 200 } } },
    { enabled: canInvite && student.userId === null },
  );
  const pending = (invitations.data?.items ?? []).find(
    (invitation) => invitation.studentId === student.id && invitation.roles.includes('student'),
  );
  const status =
    student.userId !== null
      ? t('studentProfile.appJoined')
      : pending
        ? t('studentProfile.appInvited', { contact: pending.email ?? pending.phone ?? '' })
        : t('studentProfile.appNotInvited');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('studentProfile.appAccess')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm">{status}</p>
        {canInvite && student.userId === null && student.status === 'active' && (
          <Button variant="outline" onClick={() => setInviting(true)}>
            <Send aria-hidden />
            {t('studentProfile.inviteStudent')}
          </Button>
        )}
      </CardContent>
      <FormDialog
        open={inviting}
        onOpenChange={setInviting}
        title={t('studentProfile.inviteStudentTitle')}
        description={t('studentProfile.inviteStudentBody')}
      >
        <ContactInvitationForm
          role="student"
          studentId={student.id}
          email={student.email}
          phone={student.phone}
          onDone={() => setInviting(false)}
        />
      </FormDialog>
    </Card>
  );
}

const enrolmentHelper = columnHelperFor<Enrolment>();

function EnrolmentsCard({ studentId, enrolments }: { studentId: string; enrolments: Enrolment[] }) {
  const { t } = useTranslation();
  const canManage = useCan('students.manage');
  const [adding, setAdding] = useState(false);
  const columns = useMemo(
    () =>
      enrolmentHelper.columns([
        enrolmentHelper.accessor('courseName', { header: t('enrolments.course') }),
        enrolmentHelper.accessor('licenceClass', { header: t('students.licenceClass') }),
        enrolmentHelper.accessor('startedAt', {
          header: t('enrolments.started'),
          cell: ({ getValue }) => formatDate(getValue()),
        }),
        enrolmentHelper.accessor('endedAt', {
          header: t('enrolments.ended'),
          cell: ({ getValue }) => {
            const ended = getValue();
            return ended ? formatDate(ended) : t('enrolments.ongoing');
          },
        }),
      ]),
    [t],
  );
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">{t('enrolments.title')}</h2>
        {canManage && (
          <Button variant="outline" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            {t('enrolments.add')}
          </Button>
        )}
      </div>
      <DataTable
        label={t('enrolments.title')}
        columns={columns}
        items={enrolments}
        nextCursor={null}
        status="success"
        getRowId={(enrolment) => enrolment.id}
        emptyTitle={t('enrolments.empty')}
      />
      <FormDialog open={adding} onOpenChange={setAdding} title={t('enrolments.addTitle')}>
        <EnrolmentForm studentId={studentId} onDone={() => setAdding(false)} />
      </FormDialog>
    </section>
  );
}
