import type { Lead, PublicProfile, Review } from '../../dto/index.js';
import { ENTITY, seedId } from './ids.js';
import { BERLIN } from './schools.js';
import { STUDENT_FIXTURES } from './students.js';

const CONSENT = 'lead-consent.v1';
const SAM = STUDENT_FIXTURES[1]?.id ?? '';
const STELLA = STUDENT_FIXTURES[0]?.id ?? '';

/** Fahrschule Spree's published page (the design's seed). */
export const PUBLIC_PROFILE_FIXTURES: { schoolId: string; profile: PublicProfile }[] = [
  {
    schoolId: BERLIN,
    profile: {
      slug: 'fahrschule-spree',
      published: true,
      headline: 'Learn to drive in Berlin Mitte',
      description: 'Manual and automatic lessons six days a week.',
      phone: '+4930555000100',
      whatsappNumber: '+4915550000002',
      instagramUrl: 'https://instagram.com/fahrschule.spree',
      facebookUrl: null,
      externalReviewUrl: 'https://maps.google.com/?cid=1234567890',
      showPrices: true,
      showInstructors: true,
      version: 1,
    },
  },
];

const leadBase = {
  source: 'page',
  licenceClass: 'B',
  isMinor: false,
  guardianName: null,
  guardianContact: null,
  consentTextVersion: CONSENT,
  note: null,
  studentId: null,
  convertedAt: null,
  lostAt: null,
  lostReason: null,
  version: 1,
} as const;

/** One new enquiry from the page and one that already became Sam Schulz. */
export const LEAD_FIXTURES: { schoolId: string; lead: Lead }[] = [
  {
    schoolId: BERLIN,
    lead: {
      ...leadBase,
      id: seedId(ENTITY.lead, 1),
      status: 'new',
      fullName: 'Lena Lead',
      phone: '+4915550000020',
      email: 'lena.lead@example.com',
      message: 'Can I start in November?',
      enquiries: [
        {
          message: 'Can I start in November?',
          receivedAt: '2026-10-06T09:00:00.000Z',
          source: 'page',
        },
        {
          message: 'Do you also have evening lessons?',
          receivedAt: '2026-10-08T18:30:00.000Z',
          source: 'page',
        },
      ],
      consentedAt: '2026-10-06T09:00:00.000Z',
      version: 2,
      createdAt: '2026-10-06T09:00:00.000Z',
      updatedAt: '2026-10-08T18:30:00.000Z',
    },
  },
  {
    schoolId: BERLIN,
    lead: {
      ...leadBase,
      id: seedId(ENTITY.lead, 2),
      status: 'converted',
      fullName: 'Sam Schulz',
      phone: '+4915550000007',
      email: null,
      message: 'Do you teach automatic?',
      enquiries: [
        {
          message: 'Do you teach automatic?',
          receivedAt: '2026-09-01T10:00:00.000Z',
          source: 'page',
        },
      ],
      note: 'Booked a trial lesson.',
      studentId: SAM,
      consentedAt: '2026-09-01T10:00:00.000Z',
      convertedAt: '2026-09-03T12:00:00.000Z',
      version: 2,
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-03T12:00:00.000Z',
    },
  },
];

/** One approved review (shown on the page) and one waiting for moderation. */
export const REVIEW_FIXTURES: { schoolId: string; review: Review }[] = [
  {
    schoolId: BERLIN,
    review: {
      id: seedId(ENTITY.review, 1),
      studentId: STELLA,
      displayName: 'Stella S.',
      rating: 5,
      text: 'Patient instructors and easy booking.',
      status: 'approved',
      submittedAt: '2026-10-02T15:00:00.000Z',
      moderatedAt: '2026-10-03T08:00:00.000Z',
    },
  },
  {
    schoolId: BERLIN,
    review: {
      id: seedId(ENTITY.review, 2),
      studentId: SAM,
      displayName: 'Sam S.',
      rating: 4,
      text: 'Good lessons, parking practice could be longer.',
      status: 'pending',
      submittedAt: '2026-10-05T17:30:00.000Z',
      moderatedAt: null,
    },
  },
];
