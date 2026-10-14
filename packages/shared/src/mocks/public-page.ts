import { StatusCodes } from 'http-status-codes';
import type {
  ModerateReviewRequest,
  PublicProfile,
  UpdatePublicProfileRequest,
} from '../dto/index.js';
import {
  body,
  commandResult,
  fail,
  inSchool,
  type MockResolver,
  notFound,
  page,
  requireSchool,
} from './context.js';

const RESERVED_SLUGS = new Set(['admin', 'api', 'login', 's', 'docs', 'platform', 'www', 'app']);
const SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

const invalidSlug = (message: string): never =>
  fail(StatusCodes.BAD_REQUEST, 'validation_error', 'The request is invalid.', [
    { path: ['slug'], message },
  ]);

function checkSlug(slug: string): void {
  if (RESERVED_SLUGS.has(slug)) invalidSlug('Reserved');
  if (slug.length < 3 || slug.length > 40 || !SLUG.test(slug)) {
    invalidSlug('Use 3–40 lower-case letters, digits and hyphens');
  }
}

const EMPTY_PROFILE: Omit<PublicProfile, 'slug' | 'version'> = {
  published: false,
  headline: null,
  description: null,
  phone: null,
  whatsappNumber: null,
  instagramUrl: null,
  facebookUrl: null,
  externalReviewUrl: null,
  showPrices: true,
  showInstructors: true,
};

export const publicPageResolvers: Record<string, MockResolver> = {
  'publicProfile.get': (context) => {
    const { schoolId } = requireSchool(context);
    return { body: context.store.publicProfiles.get(schoolId) ?? notFound() };
  },

  'publicProfile.update': (context) => {
    const { schoolId } = requireSchool(context);
    const request = body<UpdatePublicProfileRequest>(context);
    if (request.slug !== undefined) checkSlug(request.slug);
    const current = context.store.publicProfiles.get(schoolId);
    const slug = request.slug ?? current?.slug ?? invalidSlug('Required');
    const published = request.published ?? current?.published ?? false;
    if (published && !context.store.planFeatures(schoolId).includes('enrolment_page')) {
      fail(
        StatusCodes.FORBIDDEN,
        'feature_not_in_plan',
        'Your plan does not include this feature.',
      );
    }
    const taken = [...context.store.publicProfiles.entries()].some(
      ([otherSchool, profile]) => otherSchool !== schoolId && profile.slug === slug,
    );
    if (taken) fail(StatusCodes.CONFLICT, 'slug_taken', 'This address is already taken.');
    const next: PublicProfile = {
      ...EMPTY_PROFILE,
      ...current,
      ...request,
      slug,
      version: (current?.version ?? 0) + 1,
    };
    context.store.publicProfiles.set(schoolId, next);
    return { body: commandResult(schoolId, next.version) };
  },

  'reviews.list': (context) => {
    const { schoolId } = requireSchool(context);
    const status = context.url.searchParams.get('status');
    const items = [...context.store.reviews.values()]
      .filter((record) => record.schoolId === schoolId)
      .map((record) => record.value)
      .filter((review) => !status || review.status === status)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    return { body: page(items, context.url) };
  },

  'reviews.moderate': (context) => {
    const { schoolId } = requireSchool(context);
    const record = inSchool(context.store.reviews, context.params.id, schoolId);
    const { status } = body<ModerateReviewRequest>(context);
    record.value = { ...record.value, status, moderatedAt: context.store.isoNow() };
    record.version += 1;
    return { body: commandResult(record.value.id, record.version) };
  },
};
