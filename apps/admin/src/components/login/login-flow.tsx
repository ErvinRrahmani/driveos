import type { MembershipSummary, SessionResponse } from '@driveos/shared';
import { useNavigate } from '@tanstack/react-router';
import { Car } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { applyServerErrors, useAppForm } from '@/components/form';
import { RoleList } from '@/components/school-switcher';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useServices } from '@/hooks/use-services';
import { useSwitchSchool } from '@/hooks/use-switch-school';
import { apiErrorCode, apiErrorMessage } from '@/lib/api-errors';

const contactSchema = z.object({
  contact: z.string().trim().min(3, 'validation.contact').max(254, 'validation.contact'),
});
const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'validation.code') });

type Step =
  | { kind: 'contact' }
  | { kind: 'code'; contact: string }
  | { kind: 'school'; session: SessionResponse; choices: MembershipSummary[] };

export function LoginFlow({ redirectTo }: { redirectTo: string }) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>({ kind: 'contact' });
  const navigate = useNavigate();
  const { auth } = useServices();

  const finish = () => navigate({ href: redirectTo, replace: true });

  const onSignedIn = (session: SessionResponse) => {
    auth.setSession(session);
    const choices = session.memberships.filter((membership) => membership.status === 'active');
    if (choices.length > 1) setStep({ kind: 'school', session, choices });
    else void finish();
  };

  return (
    <div className="bg-muted/30 flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        {step.kind === 'contact' && (
          <ContactStep onSent={(contact) => setStep({ kind: 'code', contact })} />
        )}
        {step.kind === 'code' && (
          <CodeStep
            contact={step.contact}
            onBack={() => setStep({ kind: 'contact' })}
            onSignedIn={onSignedIn}
          />
        )}
        {step.kind === 'school' && (
          <SchoolStep
            session={step.session}
            choices={step.choices}
            redirectTo={redirectTo}
            onKeep={() => void finish()}
          />
        )}
      </Card>
      <span className="sr-only">{t('app.title')}</span>
    </div>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <CardHeader>
      <Car className="mb-2 size-6" aria-hidden />
      <CardTitle>
        <h1 className="text-xl">{title}</h1>
      </CardTitle>
      <CardDescription>{subtitle}</CardDescription>
    </CardHeader>
  );
}

function ContactStep({ onSent }: { onSent: (contact: string) => void }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const requestCode = api.$api.useMutation('post', '/v1/auth/code');
  const form = useAppForm({
    defaultValues: { contact: '' },
    validators: { onChange: contactSchema, onSubmit: contactSchema },
    onSubmit: async ({ value }) => {
      const contact = value.contact.trim();
      try {
        await requestCode.mutateAsync({ body: { contact } });
        onSent(contact);
      } catch (error) {
        if (!applyServerErrors(form, error))
          toast.error(apiErrorMessage(error, t('errors.generic')));
      }
    },
  });
  return (
    <>
      <Heading title={t('auth.signInTitle')} subtitle={t('auth.signInSubtitle')} />
      <CardContent>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.AppField name="contact">
            {(field) => <field.TextField label={t('auth.contact')} autoComplete="username" />}
          </form.AppField>
          <form.AppForm>
            <form.SubmitButton label={t('auth.sendCode')} />
          </form.AppForm>
        </form>
      </CardContent>
    </>
  );
}

function CodeStep({
  contact,
  onBack,
  onSignedIn,
}: {
  contact: string;
  onBack: () => void;
  onSignedIn: (session: SessionResponse) => void;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const verify = api.$api.useMutation('post', '/v1/auth/verify');
  const form = useAppForm({
    defaultValues: { code: '' },
    validators: { onChange: codeSchema, onSubmit: codeSchema },
    onSubmit: async ({ value }) => {
      try {
        onSignedIn(
          await verify.mutateAsync({ body: { contact, code: value.code, client: 'web' } }),
        );
      } catch (error) {
        if (apiErrorCode(error) === 'invalid_code') {
          form.setFieldMeta('code', (prev) => ({
            ...prev,
            isTouched: true,
            errorMap: { ...prev.errorMap, onServer: t('auth.invalidCode') },
          }));
        } else if (!applyServerErrors(form, error)) {
          toast.error(apiErrorMessage(error, t('errors.generic')));
        }
      }
    },
  });
  return (
    <>
      <Heading title={t('auth.codeTitle')} subtitle={t('auth.codeSentTo', { contact })} />
      <CardContent>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.AppField name="code">
            {(field) => (
              <field.TextField
                label={t('auth.code')}
                autoComplete="one-time-code"
                inputMode="numeric"
              />
            )}
          </form.AppField>
          <form.AppForm>
            <form.SubmitButton label={t('auth.verify')} />
          </form.AppForm>
          <Button type="button" variant="link" onClick={onBack}>
            {t('auth.changeContact')}
          </Button>
        </form>
      </CardContent>
    </>
  );
}

function SchoolStep({
  session,
  choices,
  redirectTo,
  onKeep,
}: {
  session: SessionResponse;
  choices: MembershipSummary[];
  redirectTo: string;
  onKeep: () => void;
}) {
  const { t } = useTranslation();
  const { switchTo, isPending } = useSwitchSchool();
  return (
    <>
      <Heading title={t('auth.chooseSchoolTitle')} subtitle={t('auth.chooseSchoolSubtitle')} />
      <CardContent className="grid gap-2">
        {choices.map((membership) => (
          <Button
            key={membership.membershipId}
            variant="outline"
            className="h-auto justify-start py-3"
            disabled={isPending}
            onClick={() =>
              membership.membershipId === session.activeMembershipId
                ? onKeep()
                : void switchTo(membership.membershipId, redirectTo)
            }
          >
            <span className="flex flex-col items-start">
              <span>{membership.schoolName}</span>
              <span className="text-muted-foreground text-xs">
                <RoleList roles={membership.roles} />
              </span>
            </span>
          </Button>
        ))}
      </CardContent>
    </>
  );
}
