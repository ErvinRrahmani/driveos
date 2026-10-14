import type {
  ArchiveStudentRequest,
  CreateEnrolmentRequest,
  CreateStudentRequest,
  Enrolment,
  GiveGuardianConsentRequest,
  GuardianLink,
  GuardianLinkListResponse,
  GuardianLinkStatus,
  LinkGuardianRequest,
  LinkGuardianResponse,
  ListGuardianLinksQuery,
  ListStudentsQuery,
  MyGuardianLink,
  PrivateNote,
  PrivateNoteListResponse,
  PrivateNoteParams,
  ProgressEntry,
  ProgressLevel,
  RecordTestAttemptRequest,
  ReplaceStudentInstructorsRequest,
  StudentExportBundle,
  StudentExportResponse,
  StudentInstructor,
  StudentInstructorsResponse,
  StudentListItem,
  StudentListResponse,
  StudentProgressResponse,
  StudentResponse,
  SyllabusItem,
  SyllabusProgress,
  SyllabusQuery,
  SyllabusResponse,
  TestAttempt,
  UpdateStudentRequest,
  UpsertPrivateNoteRequest,
} from '../training.js';
import { SAMPLE_IDS as ids } from './fixtures.js';

const studentListItem = {
  id: ids.student,
  fullName: 'Stella Student',
  licenceClass: 'B',
  status: 'active',
  primaryInstructorName: 'Ingo Instructor',
  balanceMinutes: 240,
  nextLessonAt: '2026-10-12T07:00:00.000Z',
  lastLessonAt: '2026-10-05T07:00:00.000Z',
  progressPct: 38,
  updatedAt: '2026-10-05T08:05:00.000Z',
} satisfies StudentListItem;

const enrolment = {
  id: ids.enrolment,
  courseName: 'Class B car licence',
  licenceClass: 'B',
  startedAt: '2026-09-01T08:00:00.000Z',
  endedAt: null,
} satisfies Enrolment;

const studentInstructor = {
  assignmentId: ids.assignment,
  instructorMembershipId: ids.instructorMembership,
  instructorName: 'Ingo Instructor',
  isPrimary: true,
  assignedAt: '2026-09-01T08:00:00.000Z',
} satisfies StudentInstructor;

const guardianLink = {
  id: ids.guardianLink,
  guardianUserId: ids.guardianUser,
  fullName: 'Gustav Minor',
  phone: '+4915550000011',
  email: 'gustav.minor@example.com',
  consentAt: '2026-09-02T18:00:00.000Z',
  consentTextVersion: '2026-09',
  revokedAt: null,
} satisfies GuardianLink;

const syllabusItem = {
  id: ids.syllabusItem,
  licenceClass: 'B',
  code: 'B01',
  title: 'Vehicle checks and controls',
  sortOrder: 1,
} satisfies SyllabusItem;

const syllabusProgress = {
  syllabusItemId: ids.syllabusItem,
  code: 'B01',
  title: 'Vehicle checks and controls',
  sortOrder: 1,
  level: 3,
  lastNote: 'Mirror checks before moving off are now routine.',
  lessonCount: 2,
  updatedAt: '2026-10-05T08:05:00.000Z',
} satisfies SyllabusProgress;

const progressEntry = {
  id: ids.progressEntry,
  lessonId: ids.lesson,
  lessonStart: '2026-10-05T07:00:00.000Z',
  instructorName: 'Ingo Instructor',
  syllabusItemId: ids.syllabusItem,
  level: 3,
  note: 'Mirror checks before moving off are now routine.',
  version: 2,
} satisfies ProgressEntry;

const privateNote = {
  id: ids.privateNote,
  lessonId: ids.lesson,
  authorMembershipId: ids.instructorMembership,
  authorName: 'Ingo Instructor',
  body: 'Nervous at multi-lane roundabouts; practise in quiet hours first.',
  version: 1,
  createdAt: '2026-10-05T08:10:00.000Z',
  updatedAt: '2026-10-05T08:10:00.000Z',
} satisfies PrivateNote;

const testAttempt = {
  id: ids.testAttempt,
  kind: 'theory',
  takenOn: '2026-09-28',
  result: 'passed',
  notes: '',
} satisfies TestAttempt;

const baseSamples = {
  progressLevel: 3 satisfies ProgressLevel,
  studentListItem,
  listStudentsQuery: {
    q: 'stel',
    status: 'active',
    instructorId: ids.instructorMembership,
    limit: 50,
  } satisfies ListStudentsQuery,
  studentListResponse: {
    items: [
      studentListItem,
      {
        ...studentListItem,
        id: ids.secondStudent,
        fullName: 'Sam Schulz',
        primaryInstructorName: null,
        balanceMinutes: -60,
        nextLessonAt: null,
        progressPct: 10,
      },
    ],
    nextCursor: 'U2FtIFNjaHVseg',
  } satisfies StudentListResponse,
  enrolment,
  studentInstructor,
  guardianLink,
  guardianLinkStatus: 'pending_consent' satisfies GuardianLinkStatus,
  myGuardianLink: {
    id: ids.guardianLink,
    studentId: ids.minorStudent,
    studentName: 'Mia Minor',
    status: 'consented',
    consentAt: '2026-09-02T18:00:00.000Z',
    createdAt: '2026-09-01T08:00:00.000Z',
  } satisfies MyGuardianLink,
  listGuardianLinksQuery: { limit: 50 } satisfies ListGuardianLinksQuery,
  guardianLinkListResponse: {
    items: [
      {
        id: ids.guardianLink,
        studentId: ids.minorStudent,
        studentName: 'Mia Minor',
        status: 'consented',
        consentAt: '2026-09-02T18:00:00.000Z',
        createdAt: '2026-09-01T08:00:00.000Z',
      },
    ],
    nextCursor: null,
  } satisfies GuardianLinkListResponse,
  studentResponse: {
    id: ids.minorStudent,
    userId: ids.minorUser,
    fullName: 'Mia Minor',
    phone: '+4915550000010',
    email: 'mia.minor@example.com',
    dateOfBirth: '2010-08-09',
    isMinor: true,
    licenceClass: 'B',
    examLanguage: 'en',
    testDate: null,
    area: 'Kreuzberg',
    pickupAddress: null,
    pickupLat: null,
    pickupLng: null,
    status: 'active',
    enrolments: [enrolment],
    instructors: [studentInstructor],
    guardians: [guardianLink],
  } satisfies StudentResponse,
  createStudentRequest: {
    fullName: 'Selin Sommer',
    dateOfBirth: '2008-03-14',
    licenceClass: 'B',
    examLanguage: 'en',
    area: 'Mitte',
    pickupAddress: 'Invalidenstraße 50, 10115 Berlin',
    pickupLat: 52.53,
    pickupLng: 13.37,
    primaryInstructorMembershipId: ids.instructorMembership,
    enrolment: { courseName: 'Class B car licence', licenceClass: 'B' },
  } satisfies CreateStudentRequest,
  updateStudentRequest: {
    testDate: '2026-12-01',
    area: 'Kreuzberg',
  } satisfies UpdateStudentRequest,
  studentInstructorsResponse: { items: [studentInstructor] } satisfies StudentInstructorsResponse,
  replaceStudentInstructorsRequest: {
    instructors: [{ instructorMembershipId: ids.instructorMembership, isPrimary: true }],
  } satisfies ReplaceStudentInstructorsRequest,
  createEnrolmentRequest: {
    courseName: 'Class B car licence',
    licenceClass: 'B',
    startedAt: '2026-10-08T08:00:00.000Z',
  } satisfies CreateEnrolmentRequest,
  syllabusItem,
  syllabusQuery: { licenceClass: 'B' } satisfies SyllabusQuery,
  syllabusResponse: {
    items: [
      syllabusItem,
      {
        id: ids.secondSyllabusItem,
        licenceClass: 'B',
        code: 'B02',
        title: 'Moving off and stopping',
        sortOrder: 2,
      },
    ],
  } satisfies SyllabusResponse,
  syllabusProgress,
  progressEntry,
  testAttempt,
  studentProgressResponse: {
    studentId: ids.student,
    licenceClass: 'B',
    progressPct: 38,
    syllabus: [
      syllabusProgress,
      {
        syllabusItemId: ids.secondSyllabusItem,
        code: 'B02',
        title: 'Moving off and stopping',
        sortOrder: 2,
        level: null,
        lastNote: null,
        lessonCount: 0,
        updatedAt: null,
      },
    ],
    entries: [progressEntry],
    testAttempts: [testAttempt],
  } satisfies StudentProgressResponse,
  recordTestAttemptRequest: {
    kind: 'practical',
    takenOn: '2026-10-07',
    result: 'failed',
    notes: 'Failed to give way at a pedestrian crossing.',
  } satisfies RecordTestAttemptRequest,
  linkGuardianRequest: { guardianUserId: ids.guardianUser } satisfies LinkGuardianRequest,
  linkGuardianResponse: {
    id: ids.guardianLink,
    version: 1,
    pending: false,
  } satisfies LinkGuardianResponse,
  giveGuardianConsentRequest: {
    consentTextVersion: '2026-09',
  } satisfies GiveGuardianConsentRequest,
  privateNote,
  privateNoteListResponse: { items: [privateNote] } satisfies PrivateNoteListResponse,
  privateNoteParams: { id: ids.student, lessonId: ids.lesson } satisfies PrivateNoteParams,
  upsertPrivateNoteRequest: {
    body: 'Nervous at multi-lane roundabouts; practise in quiet hours first.',
  } satisfies UpsertPrivateNoteRequest,
  archiveStudentRequest: { reason: 'Passed the practical test' } satisfies ArchiveStudentRequest,
};

const { guardians: _guardians, ...exportedStudent } = baseSamples.studentResponse;

const studentExportBundle = {
  exportedAt: '2026-10-08T08:00:00.000Z',
  student: exportedStudent,
  guardians: [
    {
      fullName: guardianLink.fullName,
      consentAt: guardianLink.consentAt,
      consentTextVersion: guardianLink.consentTextVersion,
      revokedAt: guardianLink.revokedAt,
    },
  ],
  lessons: [
    {
      lessonId: ids.lesson,
      start: '2026-10-05T07:00:00.000Z',
      end: '2026-10-05T08:30:00.000Z',
      status: 'completed',
      instructorName: 'Ingo Instructor',
    },
  ],
  progress: baseSamples.studentProgressResponse,
  invoices: [
    {
      id: ids.invoice,
      kind: 'invoice',
      formattedNumber: 'INV-2026-000001',
      status: 'paid',
      issuedAt: '2026-10-01T09:00:00.000Z',
      totalMinor: 59000,
      currency: 'EUR',
    },
  ],
  ledger: [
    {
      id: ids.ledgerEntry,
      entryType: 'purchase',
      minutes: 450,
      balanceAfter: 450,
      paymentId: ids.payment,
      createdAt: '2026-10-01T09:00:00.000Z',
    },
  ],
  documents: [{ id: ids.document, kind: 'learner_permit', createdAt: '2026-09-20T10:00:00.000Z' }],
} satisfies StudentExportBundle;

export const trainingSamples = {
  ...baseSamples,
  studentExportBundle,
  studentExportResponse: {
    bundle: studentExportBundle,
    pdfBase64: 'JVBERi0xLjQKJSVFT0YK',
  } satisfies StudentExportResponse,
};
