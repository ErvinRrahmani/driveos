import { describe, expect, it } from 'vitest';
import {
  createEnrolmentRequestSchema,
  createStudentRequestSchema,
  giveGuardianConsentRequestSchema,
  linkGuardianRequestSchema,
  linkGuardianResponseSchema,
  listStudentsQuerySchema,
  privateNoteListResponseSchema,
  privateNoteParamsSchema,
  recordTestAttemptRequestSchema,
  replaceStudentInstructorsRequestSchema,
  studentExportResponseSchema,
  studentProgressResponseSchema,
  syllabusProgressSchema,
  updateStudentRequestSchema,
  upsertPrivateNoteRequestSchema,
} from '../src/index.js';
import { DTO_SAMPLES } from '../src/dto/samples/index.js';

const id = '0192f000-0003-7000-8000-000000000003';
const other = '0192f000-0003-7000-8000-000000000001';
const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('students', () => {
  it('creates with a name, a birth date and a licence class, and no school id', () => {
    const body = DTO_SAMPLES.training.createStudentRequest;
    expect(ok(createStudentRequestSchema, body)).toBe(true);
    expect(ok(createStudentRequestSchema, { ...body, dateOfBirth: '12.04.2003' })).toBe(false);
    expect(ok(createStudentRequestSchema, { ...body, schoolId: id })).toBe(false);
    const { fullName: _fullName, ...nameless } = body;
    expect(ok(createStudentRequestSchema, nameless)).toBe(false);
  });

  it('can assign a primary instructor and open the first enrolment on creation', () => {
    const body = DTO_SAMPLES.training.createStudentRequest;
    const full = {
      ...body,
      primaryInstructorMembershipId: id,
      enrolment: { courseName: 'Class B', licenceClass: 'B' },
    };
    expect(ok(createStudentRequestSchema, full)).toBe(true);
    expect(ok(createStudentRequestSchema, { ...full, primaryInstructorMembershipId: 'x' })).toBe(
      false,
    );
    expect(ok(createStudentRequestSchema, { ...full, enrolment: { courseName: '' } })).toBe(false);
    expect(
      ok(createStudentRequestSchema, {
        ...full,
        enrolment: { courseName: 'Class B', licenceClass: 'B', startedAt: 'now' },
      }),
    ).toBe(false);
  });

  it('patches at least one field and can clear optional ones', () => {
    expect(ok(updateStudentRequestSchema, { testDate: null })).toBe(true);
    expect(ok(updateStudentRequestSchema, {})).toBe(false);
    expect(ok(updateStudentRequestSchema, { status: 'archived' })).toBe(false);
  });

  it('filters the list by status and instructor', () => {
    expect(listStudentsQuerySchema.parse({ status: 'active', instructorId: id, q: 'ste' })).toEqual(
      { status: 'active', instructorId: id, q: 'ste', limit: 50 },
    );
    expect(ok(listStudentsQuerySchema, { status: 'deleted' })).toBe(false);
  });
});

describe('PUT /v1/students/{id}/instructors', () => {
  it('needs exactly one primary instructor (or none assigned) and no duplicates', () => {
    const one = { instructorMembershipId: id, isPrimary: true };
    expect(ok(replaceStudentInstructorsRequestSchema, { instructors: [] })).toBe(true);
    expect(
      ok(replaceStudentInstructorsRequestSchema, { instructors: [{ ...one, isPrimary: false }] }),
    ).toBe(false);
    expect(
      ok(replaceStudentInstructorsRequestSchema, {
        instructors: [one, { instructorMembershipId: other, isPrimary: false }],
      }),
    ).toBe(true);
    expect(
      ok(replaceStudentInstructorsRequestSchema, {
        instructors: [one, { instructorMembershipId: other, isPrimary: true }],
      }),
    ).toBe(false);
    expect(
      ok(replaceStudentInstructorsRequestSchema, {
        instructors: [one, { ...one, isPrimary: false }],
      }),
    ).toBe(false);
  });
});

describe('enrolments, test attempts, guardians', () => {
  it('validates each body', () => {
    expect(ok(createEnrolmentRequestSchema, { courseName: 'Class B', licenceClass: 'B' })).toBe(
      true,
    );
    expect(
      recordTestAttemptRequestSchema.parse({
        kind: 'theory',
        takenOn: '2026-10-01',
        result: 'passed',
      }),
    ).toEqual({ kind: 'theory', takenOn: '2026-10-01', result: 'passed', notes: '' });
    expect(
      ok(recordTestAttemptRequestSchema, { kind: 'oral', takenOn: '2026-10-01', result: 'passed' }),
    ).toBe(false);
    expect(ok(linkGuardianRequestSchema, { guardianUserId: id })).toBe(true);
    expect(ok(linkGuardianRequestSchema, { email: 'parent@example.com' })).toBe(true);
    expect(ok(linkGuardianRequestSchema, { phone: '+4915550000099' })).toBe(true);
    expect(ok(linkGuardianRequestSchema, {})).toBe(false);
    expect(ok(linkGuardianRequestSchema, { guardianUserId: id, email: 'parent@example.com' })).toBe(
      false,
    );
    expect(linkGuardianResponseSchema.parse({ id, version: 1, pending: true })).toEqual({
      id,
      version: 1,
      pending: true,
    });
    expect(ok(giveGuardianConsentRequestSchema, { consentTextVersion: '' })).toBe(false);
  });
});

describe('GET /v1/students/{id}/progress', () => {
  it('never carries private notes', () => {
    const sample = DTO_SAMPLES.training.studentProgressResponse;
    const parsed = studentProgressResponseSchema.parse({
      ...sample,
      privateNotes: [{ body: 'secret' }],
      entries: sample.entries.map((entry) => ({ ...entry, privateNote: 'secret' })),
    });
    expect(JSON.stringify(parsed)).not.toContain('secret');
  });
});

describe('progress per syllabus item', () => {
  it('counts the lessons that touched the item', () => {
    const sample = DTO_SAMPLES.training.syllabusProgress;
    expect(syllabusProgressSchema.parse(sample).lessonCount).toBe(2);
    expect(ok(syllabusProgressSchema, { ...sample, lessonCount: -1 })).toBe(false);
    const { lessonCount: _count, ...withoutCount } = sample;
    expect(ok(syllabusProgressSchema, withoutCount)).toBe(false);
  });
});

describe('private notes (staff only)', () => {
  it('upserts a non-empty body of at most 5000 characters, nothing else', () => {
    expect(upsertPrivateNoteRequestSchema.parse({ body: '  Nervous at roundabouts  ' })).toEqual({
      body: 'Nervous at roundabouts',
    });
    expect(ok(upsertPrivateNoteRequestSchema, { body: ' ' })).toBe(false);
    expect(ok(upsertPrivateNoteRequestSchema, { body: 'x'.repeat(5001) })).toBe(false);
    expect(ok(upsertPrivateNoteRequestSchema, { body: 'ok', authorMembershipId: id })).toBe(false);
  });

  it('addresses a note by student and lesson', () => {
    expect(ok(privateNoteParamsSchema, { id, lessonId: other })).toBe(true);
    expect(ok(privateNoteParamsSchema, { id, lessonId: 'nope' })).toBe(false);
  });

  it('lists notes with the author name', () => {
    const parsed = privateNoteListResponseSchema.parse(
      DTO_SAMPLES.training.privateNoteListResponse,
    );
    expect(parsed.items[0]).toMatchObject({ authorName: 'Ingo Instructor', version: 1 });
  });
});

describe('POST /v1/students/{id}/export', () => {
  it('returns the bundle and a base64 PDF synchronously', () => {
    const parsed = studentExportResponseSchema.parse(DTO_SAMPLES.training.studentExportResponse);
    expect(Buffer.from(parsed.pdfBase64, 'base64').toString('latin1')).toMatch(/^%PDF/);
    expect(parsed.bundle.student.id).toBe(DTO_SAMPLES.training.studentResponse.id);
  });

  it('never carries guardian contacts or private notes', () => {
    const sample = DTO_SAMPLES.training.studentExportResponse;
    const parsed = studentExportResponseSchema.parse({
      ...sample,
      bundle: {
        ...sample.bundle,
        privateNotes: [{ body: 'secret' }],
        student: { ...sample.bundle.student, guardians: [{ phone: '+49secret' }] },
        guardians: sample.bundle.guardians.map((guardian) => ({
          ...guardian,
          phone: '+49secret',
          email: 'secret@example.com',
        })),
      },
    });
    expect(JSON.stringify(parsed)).not.toContain('secret');
  });
});
