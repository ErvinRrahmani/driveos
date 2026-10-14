import { StatusCodes } from 'http-status-codes';
import {
  type CaptureLeadRequest,
  LEAD_CONSENT_TEXT_VERSION,
  type ModerateReviewRequest,
  type PublicProfile,
  type PublicSchoolPage,
  type SubmitReviewRequest,
  type UpdatePublicProfileRequest,
} from '../dto/index.js';
import { DTO_SAMPLES } from '../dto/samples/index.js';
import {
  body,
  commandResult,
  fail,
  inSchool,
  type MockContext,
  type MockResolver,
  notFound,
  page,
  requireSchool,
  requireSession,
} from './context.js';
import { PASSED_PRACTICAL_STUDENT_IDS } from './fixtures/students.js';
import { addLead } from './leads.js';
import type { MockStore } from './store.js';

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

const ENROLMENT_PAGE = 'enrolment_page';
const REVIEWS_ON_PAGE = 20;

const schoolNotFound = (): never =>
  fail(StatusCodes.NOT_FOUND, 'school_not_found', 'This school page does not exist.');

/** The school behind a published page whose plan has the enrolment page, as the API resolves it. */
function publicSchool(context: MockContext): { schoolId: string; profile: PublicProfile } {
  const slug = context.params.slug;
  const found = [...context.store.publicProfiles.entries()].find(
    ([, profile]) => profile.slug === slug,
  );
  if (!found) return schoolNotFound();
  const [schoolId, profile] = found;
  const live =
    profile.published &&
    context.store.schools.get(schoolId)?.status === 'active' &&
    context.store.planFeatures(schoolId).includes(ENROLMENT_PAGE);
  return live ? { schoolId, profile } : schoolNotFound();
}

const inSchoolValues = <T>(map: Map<string, { schoolId: string | null; value: T }>, id: string) =>
  [...map.values()].filter((record) => record.schoolId === id).map((record) => record.value);

/** The mock keeps no opening hours store; every branch shows the sample's school-wide hours. */
const OPENING_HOURS = DTO_SAMPLES.school.openingHoursResponse.items.map(
  ({ weekday, opens, closes }) => ({ weekday, opens, closes }),
);

function publicPageOf(store: MockStore, schoolId: string, profile: PublicProfile) {
  const school = store.schools.get(schoolId) ?? schoolNotFound();
  const prices = inSchoolValues(store.priceItems, schoolId)
    .filter((item) => item.active && item.showOnPublicPage)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ id, name, kind, amountMinor, currency, creditMinutes }) => ({
      id,
      name,
      kind,
      amountMinor,
      currency,
      creditMinutes,
    }));
  const instructors = [...store.memberships.values()]
    .filter(
      (membership) =>
        membership.schoolId === schoolId &&
        membership.status === 'active' &&
        membership.roles.includes('instructor'),
    )
    .map((membership) => ({ membershipId: membership.id, name: store.userName(membership.userId) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const approved = inSchoolValues(store.reviews, schoolId)
    .filter((review) => review.status === 'approved')
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const ratingSum = approved.reduce((sum, review) => sum + review.rating, 0);
  const licenceClasses = [
    ...new Set(
      inSchoolValues(store.lessonTypes, schoolId)
        .filter((type) => type.active)
        .map((type) => type.licenceClass),
    ),
  ].sort();
  const result: PublicSchoolPage = {
    slug: profile.slug,
    name: school.name,
    headline: profile.headline,
    description: profile.description,
    address: school.address,
    phone: profile.phone,
    whatsappUrl: profile.whatsappNumber
      ? `https://wa.me/${profile.whatsappNumber.replace(/\D/g, '')}`
      : null,
    instagramUrl: profile.instagramUrl,
    facebookUrl: profile.facebookUrl,
    externalReviewUrl: profile.externalReviewUrl,
    timeZone: school.timeZone,
    currency: school.currency,
    locale: school.locale,
    branches: inSchoolValues(store.branches, schoolId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ id, name, address, lat, lng }) => ({
        id,
        name,
        address,
        lat,
        lng,
        openingHours: OPENING_HOURS,
      })),
    prices: profile.showPrices ? prices : [],
    instructors: profile.showInstructors ? instructors : [],
    reviews: {
      count: approved.length,
      averageRatingTenths: approved.length ? Math.round((ratingSum * 10) / approved.length) : 0,
      items: approved
        .slice(0, REVIEWS_ON_PAGE)
        .map(({ id, displayName, rating, text, submittedAt }) => ({
          id,
          displayName,
          rating,
          text,
          submittedAt,
        })),
    },
    licenceClasses: licenceClasses.length ? licenceClasses : ['B'],
    consentTextVersion: LEAD_CONSENT_TEXT_VERSION,
  };
  return result;
}

/** First name plus the last-name initial, as the API shows reviewers ("Stella S."). */
function reviewerName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const last = parts.length > 1 ? parts.at(-1) : undefined;
  return last ? `${parts[0] ?? ''} ${last.charAt(0).toUpperCase()}.` : (parts[0] ?? '');
}

export const publicPageResolvers: Record<string, MockResolver> = {
  'publicSchools.get': (context) => {
    const { schoolId, profile } = publicSchool(context);
    return { body: publicPageOf(context.store, schoolId, profile) };
  },

  /** A filled honeypot (`website`) answers 201 with a throw-away id and stores nothing. */
  'publicLeads.capture': (context) => {
    const { schoolId } = publicSchool(context);
    const { website, ...request } = body<CaptureLeadRequest>(context);
    if (website) return { body: { id: context.store.nextId() } };
    return { body: { id: addLead(context.store, schoolId, { ...request, source: 'page' }) } };
  },

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

  /** Same order as the API: own student record (404), passed practical (403), one review (409). */
  'reviews.submit': (context) => {
    const { schoolId } = requireSchool(context);
    const { userId } = requireSession(context);
    const student =
      [...context.store.students.values()].find(
        (record) => record.schoolId === schoolId && record.value.userId === userId,
      )?.value ?? notFound();
    if (!PASSED_PRACTICAL_STUDENT_IDS.has(student.id)) {
      fail(
        StatusCodes.FORBIDDEN,
        'review_not_available',
        'Reviews open after you pass the practical driving test.',
      );
    }
    const reviewed = [...context.store.reviews.values()].some(
      (record) => record.schoolId === schoolId && record.value.studentId === student.id,
    );
    if (reviewed)
      fail(StatusCodes.CONFLICT, 'review_exists', 'You have already reviewed this school.');
    const { rating, text } = body<SubmitReviewRequest>(context);
    const id = context.store.nextId();
    context.store.reviews.set(id, {
      schoolId,
      version: 1,
      value: {
        id,
        studentId: student.id,
        displayName: reviewerName(student.fullName),
        rating,
        text: text || null,
        status: 'pending',
        submittedAt: context.store.isoNow(),
        moderatedAt: null,
      },
    });
    return { body: commandResult(id, 1) };
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
