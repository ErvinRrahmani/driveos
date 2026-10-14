import type { PublicSchoolPage } from '@driveos/shared';
import { StatusCodes } from 'http-status-codes';
import { CheckCircle2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { applyServerErrors, RevealedFields, useAppForm } from '@/components/form';
import { Button } from '@/components/ui/button';
import { useServices } from '@/hooks/use-services';
import {
  type ConsentTextKey,
  consentTextKey,
  emptyEnquiry,
  type EnquiryValues,
  enquiryBody,
  enquiryErrors,
} from '@/lib/public-page';

type Failure = 'checkFields' | 'rateLimited' | 'failed';

const FAILURE_KEYS = {
  checkFields: 'publicPage.site.form.checkFields',
  rateLimited: 'publicPage.site.form.rateLimited',
  failed: 'publicPage.site.form.failed',
} as const;

/** The enquiry section: the form, then a thanks message in its place once it is sent. */
export function EnrolmentSection({ page }: { page: PublicSchoolPage }) {
  const { t } = useTranslation();
  const titleId = useId();
  const [sent, setSent] = useState(false);
  const consentKey = consentTextKey(page.consentTextVersion);
  return (
    <section aria-labelledby={titleId} className="bg-card rounded-xl border p-5">
      {sent ? (
        <Thanks id={titleId} school={page.name} />
      ) : (
        <>
          <h2 id={titleId} className="text-lg font-semibold">
            {t('publicPage.site.form.title')}
          </h2>
          {consentKey ? (
            <>
              <p className="text-muted-foreground mt-1 text-sm">
                {t('publicPage.site.form.description')}
              </p>
              <EnrolmentForm
                page={page}
                consentKey={consentKey}
                labelledBy={titleId}
                onSent={() => setSent(true)}
              />
            </>
          ) : (
            <p className="text-muted-foreground mt-1 text-sm">
              {t('publicPage.site.form.unavailable')}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Thanks({ id, school }: { id: string; school: string }) {
  const { t } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <CheckCircle2 aria-hidden className="size-8 text-emerald-600" />
      <h2 id={id} ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">
        {t('publicPage.site.thanks.title')}
      </h2>
      <p className="text-muted-foreground text-sm">
        {t('publicPage.site.thanks.body', { school })}
      </p>
    </div>
  );
}

function EnrolmentForm({
  page,
  consentKey,
  labelledBy,
  onSent,
}: {
  page: PublicSchoolPage;
  consentKey: ConsentTextKey;
  labelledBy: string;
  onSent: () => void;
}) {
  const { t } = useTranslation();
  const { publicApi } = useServices();
  const honeypotId = useId();
  const [failure, setFailure] = useState<Failure | null>(null);
  const validate = ({ value }: { value: EnquiryValues }) => {
    const fields = enquiryErrors(value, page.consentTextVersion);
    return fields ? { fields } : undefined;
  };
  const form = useAppForm({
    defaultValues: emptyEnquiry(page.licenceClasses[0] ?? 'B'),
    validators: { onChange: validate, onSubmit: validate },
    onSubmitInvalid: () => setFailure('checkFields'),
    onSubmit: async ({ value }) => {
      setFailure(null);
      try {
        const { response, error } = await publicApi.fetchClient.POST(
          '/v1/public/schools/{slug}/leads',
          {
            params: { path: { slug: page.slug } },
            body: enquiryBody(value, page.consentTextVersion),
          },
        );
        if (response.ok) return onSent();
        if (response.status === StatusCodes.TOO_MANY_REQUESTS) return setFailure('rateLimited');
        setFailure(applyServerErrors(form, error) ? 'checkFields' : 'failed');
      } catch {
        setFailure('failed');
      }
    },
  });
  const licenceOptions = page.licenceClasses.map((value) => ({ value, label: value }));

  return (
    <form
      aria-labelledby={labelledBy}
      className="relative mt-4 grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="fullName">
        {(field) => (
          <field.TextField label={t('publicPage.site.form.fullName')} autoComplete="name" />
        )}
      </form.AppField>
      <div className="grid gap-4 sm:grid-cols-2">
        <form.AppField name="phone">
          {(field) => (
            <field.TextField
              label={t('publicPage.site.form.phone')}
              type="tel"
              autoComplete="tel"
              description={t('publicPage.site.form.contactHint')}
            />
          )}
        </form.AppField>
        <form.AppField name="email">
          {(field) => (
            <field.TextField
              label={t('publicPage.site.form.email')}
              type="email"
              autoComplete="email"
            />
          )}
        </form.AppField>
      </div>
      <form.AppField name="licenceClass">
        {(field) => (
          <field.SelectField
            label={t('publicPage.site.form.licenceClass')}
            options={licenceOptions}
          />
        )}
      </form.AppField>
      <form.AppField name="message">
        {(field) => <field.TextAreaField label={t('publicPage.site.form.message')} />}
      </form.AppField>
      <form.AppField name="isMinor">
        {(field) => <field.CheckboxField label={t('publicPage.site.form.isMinor')} />}
      </form.AppField>
      <form.Subscribe selector={(state) => state.values.isMinor}>
        {(isMinor) => (
          <RevealedFields shown={isMinor} className="grid gap-4 sm:grid-cols-2">
            <form.AppField name="guardianName">
              {(field) => <field.TextField label={t('publicPage.site.form.guardianName')} />}
            </form.AppField>
            <form.AppField name="guardianContact">
              {(field) => <field.TextField label={t('publicPage.site.form.guardianContact')} />}
            </form.AppField>
          </RevealedFields>
        )}
      </form.Subscribe>
      <form.Field name="website">
        {(field) => (
          <div aria-hidden="true" className="absolute -left-[9999px] size-px overflow-hidden">
            <label htmlFor={honeypotId}>{t('publicPage.site.form.honeypot')}</label>
            <input
              id={honeypotId}
              name={field.name}
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </div>
        )}
      </form.Field>
      <form.AppField name="consent">
        {(field) => <field.CheckboxField label={t(consentKey, { school: page.name })} />}
      </form.AppField>
      <p role="alert" className="text-destructive text-sm empty:hidden">
        {failure && t(FAILURE_KEYS[failure])}
      </p>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" size="lg" disabled={isSubmitting} className="w-full sm:w-auto">
            {isSubmitting ? t('publicPage.site.form.sending') : t('publicPage.site.form.submit')}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
