import type { Lead } from '@driveos/shared';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, useAppForm } from '@/components/form';
import {
  STUDENT_DETAILS_DEFAULTS,
  STUDENT_DETAILS_FIELDS,
  StudentDetailsFields,
  studentDetailsBody,
  studentDetailsShape,
} from '@/components/students/student-fields';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { useIdempotencyKey } from '@/hooks/use-idempotency-key';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useInstructors } from '@/hooks/use-scheduling-options';
import { useServices } from '@/hooks/use-services';
import { apiErrorCode } from '@/lib/api-errors';
import { leadContact } from '@/lib/leads';

const convertSchema = z.object({
  ...studentDetailsShape,
  primaryInstructorMembershipId: z.string().nullable(),
  invite: z.boolean(),
  inviteParent: z.boolean(),
});
type ConvertValues = z.input<typeof convertSchema>;

/** "Convert to student": the create-student fields pre-filled from the lead, plus invitations. */
export function ConvertLeadForm({
  lead,
  onConverted,
  onCancel,
}: {
  lead: Lead;
  onConverted: (studentId: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const idempotency = useIdempotencyKey();
  const instructors = useInstructors();
  const contact = leadContact(lead);
  const canInviteParent = lead.isMinor && lead.guardianContact !== null;
  const convert = useMutation({
    mutationFn: async (body: ReturnType<typeof requestBody>) => {
      const { data, error, response } = await api.fetchClient.POST('/v1/leads/{id}/convert', {
        params: { path: { id: lead.id }, header: { 'Idempotency-Key': idempotency.current() } },
        body,
      });
      idempotency.settle(response.status);
      if (error) throw error;
      return data;
    },
  });
  const defaultValues: ConvertValues = {
    ...STUDENT_DETAILS_DEFAULTS,
    primaryInstructorMembershipId: null,
    invite: contact !== null,
    inviteParent: canInviteParent,
  };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: convertSchema, onSubmit: convertSchema },
    onSubmit: async ({ value }) => {
      try {
        const result = await convert.mutateAsync(requestBody(convertSchema.parse(value)));
        await invalidate('/v1/leads', '/v1/leads/{id}', '/v1/students');
        toast.success(t('leads.convertForm.done', { name: lead.fullName }));
        onConverted(result.studentId);
      } catch (error) {
        if (apiErrorCode(error) === 'lead_already_converted') {
          toast.error(t('leads.alreadyConverted'));
          await invalidate('/v1/leads', '/v1/leads/{id}');
          onCancel();
          return;
        }
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
      <dl className="bg-muted/50 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md p-3 text-sm">
        <dt className="text-muted-foreground">{t('students.fullName')}</dt>
        <dd className="font-medium">{lead.fullName}</dd>
        <dt className="text-muted-foreground">{t('students.licenceClass')}</dt>
        <dd>{lead.licenceClass}</dd>
      </dl>
      <StudentDetailsFields form={form} fields={STUDENT_DETAILS_FIELDS} />
      <form.AppField name="primaryInstructorMembershipId">
        {(field) => (
          <field.SelectField
            label={t('leads.convertForm.primaryInstructor')}
            options={instructors.options}
            emptyLabel={t('leads.convertForm.noInstructor')}
          />
        )}
      </form.AppField>
      {contact !== null && (
        <form.AppField name="invite">
          {(field) => (
            <field.SwitchField
              label={t('leads.convertForm.invite')}
              description={t('leads.convertForm.inviteHint', { contact })}
            />
          )}
        </form.AppField>
      )}
      {canInviteParent && (
        <form.AppField name="inviteParent">
          {(field) => (
            <field.SwitchField
              label={t('leads.convertForm.inviteParent')}
              description={t('leads.convertForm.inviteParentHint', {
                contact: lead.guardianContact,
              })}
            />
          )}
        </form.AppField>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <form.AppForm>
          <form.SubmitButton label={t('leads.convertForm.submit')} />
        </form.AppForm>
      </DialogFooter>
    </form>
  );
}

function requestBody(value: z.output<typeof convertSchema>) {
  const { primaryInstructorMembershipId, invite, inviteParent, ...details } = value;
  return {
    ...studentDetailsBody(details),
    ...(primaryInstructorMembershipId && { primaryInstructorMembershipId }),
    invite,
    inviteParent,
  };
}
