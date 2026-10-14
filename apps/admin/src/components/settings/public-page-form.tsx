import type { PublicProfile } from '@driveos/shared';
import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, useAppForm } from '@/components/form';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { apiErrorCode } from '@/lib/api-errors';
import { emptyToNull, optionalHttpsUrl, optionalPhone, optionalText } from '@/lib/form-schemas';

/** Mirrors the API's slug rule (school `domain/slug.ts`); the server stays the authority. */
const RESERVED_SLUGS = new Set(['admin', 'api', 'login', 's', 'docs', 'platform', 'www', 'app']);
const SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

const profileSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'validation.required')
    .refine((value) => !RESERVED_SLUGS.has(value), 'validation.slugReserved')
    .refine(
      (value) => value.length >= 3 && value.length <= 40 && SLUG.test(value),
      'validation.slug',
    ),
  published: z.boolean(),
  headline: optionalText(120),
  description: optionalText(2000),
  phone: optionalPhone(),
  whatsappNumber: optionalPhone(),
  instagramUrl: optionalHttpsUrl(300),
  facebookUrl: optionalHttpsUrl(300),
  externalReviewUrl: optionalHttpsUrl(500),
  showPrices: z.boolean(),
  showInstructors: z.boolean(),
});
type ProfileValues = z.input<typeof profileSchema>;

function defaultsFrom(profile: PublicProfile | null): ProfileValues {
  return {
    slug: profile?.slug ?? '',
    published: profile?.published ?? false,
    headline: profile?.headline ?? '',
    description: profile?.description ?? '',
    phone: profile?.phone ?? '',
    whatsappNumber: profile?.whatsappNumber ?? '',
    instagramUrl: profile?.instagramUrl ?? '',
    facebookUrl: profile?.facebookUrl ?? '',
    externalReviewUrl: profile?.externalReviewUrl ?? '',
    showPrices: profile?.showPrices ?? true,
    showInstructors: profile?.showInstructors ?? true,
  };
}

/** The owner's public page settings; `profile` is null until the school saves it once. */
export function PublicPageForm({ profile }: { profile: PublicProfile | null }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const save = api.$api.useMutation('put', '/v1/school/public-profile');
  const form = useAppForm({
    defaultValues: defaultsFrom(profile),
    validators: { onChange: profileSchema, onSubmit: profileSchema },
    onSubmit: async ({ value }) => {
      const parsed = profileSchema.parse(value);
      try {
        await save.mutateAsync({
          body: {
            slug: parsed.slug,
            published: parsed.published,
            headline: emptyToNull(parsed.headline),
            description: emptyToNull(parsed.description),
            phone: emptyToNull(parsed.phone),
            whatsappNumber: emptyToNull(parsed.whatsappNumber),
            instagramUrl: emptyToNull(parsed.instagramUrl),
            facebookUrl: emptyToNull(parsed.facebookUrl),
            externalReviewUrl: emptyToNull(parsed.externalReviewUrl),
            showPrices: parsed.showPrices,
            showInstructors: parsed.showInstructors,
          },
        });
        await invalidate('/v1/school/public-profile');
        toast.success(t('publicPage.saved'));
      } catch (error) {
        const code = apiErrorCode(error);
        if (code === 'slug_taken') {
          form.setFieldMeta('slug', (prev) => ({
            ...prev,
            isTouched: true,
            errorMap: { ...prev.errorMap, onServer: 'publicPage.slugTaken' },
          }));
        } else if (code === 'feature_not_in_plan') {
          toast.error(t('publicPage.featureNotInPlan'));
        } else {
          reportSubmitError(form, error, t('errors.generic'));
        }
      }
    },
  });
  const previewSlug = profile?.published ? profile.slug : null;
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="text-sm sm:col-span-2">
        {previewSlug ? (
          <a
            href={`/s/${previewSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
          >
            {t('publicPage.preview')}
            <ExternalLink className="size-4" aria-hidden />
          </a>
        ) : (
          <p className="text-muted-foreground">{t('publicPage.notPublished')}</p>
        )}
      </div>
      <form.AppField name="slug">
        {(field) => (
          <field.TextField
            label={t('publicPage.slug')}
            description={t('publicPage.slugHint')}
            autoComplete="off"
          />
        )}
      </form.AppField>
      <form.AppField name="published">
        {(field) => (
          <field.SwitchField
            label={t('publicPage.published')}
            description={t('publicPage.publishedHint')}
            className="self-center"
          />
        )}
      </form.AppField>
      <form.AppField name="headline">
        {(field) => <field.TextField label={t('publicPage.headline')} className="sm:col-span-2" />}
      </form.AppField>
      <form.AppField name="description">
        {(field) => (
          <field.TextAreaField label={t('publicPage.about')} rows={4} className="sm:col-span-2" />
        )}
      </form.AppField>
      <form.AppField name="phone">
        {(field) => <field.TextField label={t('publicPage.phone')} type="tel" />}
      </form.AppField>
      <form.AppField name="whatsappNumber">
        {(field) => <field.TextField label={t('publicPage.whatsappNumber')} type="tel" />}
      </form.AppField>
      <form.AppField name="instagramUrl">
        {(field) => <field.TextField label={t('publicPage.instagramUrl')} inputMode="text" />}
      </form.AppField>
      <form.AppField name="facebookUrl">
        {(field) => <field.TextField label={t('publicPage.facebookUrl')} inputMode="text" />}
      </form.AppField>
      <form.AppField name="externalReviewUrl">
        {(field) => (
          <field.TextField label={t('publicPage.externalReviewUrl')} className="sm:col-span-2" />
        )}
      </form.AppField>
      <form.AppField name="showPrices">
        {(field) => <field.SwitchField label={t('publicPage.showPrices')} />}
      </form.AppField>
      <form.AppField name="showInstructors">
        {(field) => <field.SwitchField label={t('publicPage.showInstructors')} />}
      </form.AppField>
      <div className="flex justify-end sm:col-span-2">
        <form.AppForm>
          <form.SubmitButton label={t('publicPage.save')} />
        </form.AppForm>
      </div>
    </form>
  );
}
