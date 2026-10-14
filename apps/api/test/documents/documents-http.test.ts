import { DocumentUploaded } from '@driveos/shared';
import { StatusCodes } from 'http-status-codes';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createStudent } from '../identity/support.js';
import { insertLesson, insertLessonType } from '../scheduling/support.js';
import { expectEvents } from '../support/events.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import { assignInstructor, createLogin, linkGuardianRow, type Login } from '../training/support.js';
import { createDocumentRow } from './support.js';

const PDF = { kind: 'eye_test', mime: 'application/pdf', sizeBytes: 2048 } as const;
const MINUTE_MS = 60_000;

describe('documents HTTP', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;
  let http: ReturnType<typeof request>;
  let office: Login;
  let ingo: Login;
  let stella: Login;
  let otto: Login;
  let paula: Login;
  let stellaId: string;
  let ottoId: string;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A, B } = tenants);
    http = request(kernel.app.getHttpServer());
    office = await createLogin(tenants, A, ['office']);
    ingo = await createLogin(tenants, A, ['instructor']);
    stella = await createLogin(tenants, A, ['student']);
    otto = await createLogin(tenants, A, ['student']);
    paula = await createLogin(tenants, A, ['parent']);
    stellaId = await createStudent(tenants, A, {
      dateOfBirth: '2000-01-01',
      userId: stella.userId,
    });
    ottoId = await createStudent(tenants, A, { dateOfBirth: '2000-01-01', userId: otto.userId });
    await assignInstructor(tenants, A, stellaId, ingo.membershipId);
    await linkGuardianRow(tenants, A, stellaId, paula.userId, new Date());
  }, 60_000);

  afterAll(async () => {
    kernel?.storage.setClock(() => new Date());
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  const auditRows = async (targetId: string) =>
    (
      await system.query<{ action: string; actor_user_id: string }>(
        `select action, actor_user_id from audit_log where target_id = $1 order by at`,
        [targetId],
      )
    ).rows;

  async function uploadAs(login: Login, body: Record<string, unknown> = PDF) {
    const res = await http.post('/v1/documents/upload-url').set(login.headers).send(body);
    expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.CREATED);
    return res.body as { documentId: string; uploadUrl: string; headers: Record<string, string> };
  }

  async function uploadedDocument(login: Login, body: Record<string, unknown> = PDF) {
    const upload = await uploadAs(login, body);
    expect(
      kernel.storage.upload(upload.uploadUrl, { sizeBytes: PDF.sizeBytes, mime: PDF.mime }).ok,
    ).toBe(true);
    await http
      .post(`/v1/documents/${upload.documentId}/complete`)
      .set(login.headers)
      .expect(StatusCodes.OK);
    return upload.documentId;
  }

  describe('upload', () => {
    it('gives a student a short-lived signed PUT for their own record and completes after the object exists', async () => {
      const before = Date.now();
      const upload = await http.post('/v1/documents/upload-url').set(stella.headers).send(PDF);
      expect(upload.status, JSON.stringify(upload.body)).toBe(StatusCodes.CREATED);
      expect(upload.body).toMatchObject({ method: 'PUT', headers: { 'Content-Type': PDF.mime } });
      const expiresAt = Date.parse(upload.body.expiresAt as string);
      expect(expiresAt - before).toBeGreaterThanOrEqual(14 * MINUTE_MS);
      expect(expiresAt - before).toBeLessThanOrEqual(16 * MINUTE_MS);
      const documentId = upload.body.documentId as string;

      const early = await http.post(`/v1/documents/${documentId}/complete`).set(stella.headers);
      expect(early.status).toBe(StatusCodes.CONFLICT);
      expect(early.body.error.code).toBe('upload_incomplete');

      const wrong = kernel.storage.upload(upload.body.uploadUrl as string, {
        sizeBytes: PDF.sizeBytes,
        mime: 'image/png',
      });
      expect(wrong).toEqual({ ok: false, reason: 'mismatch' });
      kernel.storage.upload(upload.body.uploadUrl as string, {
        sizeBytes: PDF.sizeBytes,
        mime: PDF.mime,
      });
      const done = await http.post(`/v1/documents/${documentId}/complete`).set(stella.headers);
      expect(done.status, JSON.stringify(done.body)).toBe(StatusCodes.OK);
      expect(done.body).toEqual({ id: documentId, version: 1 });
      const [event] = await expectEvents(db, { type: DocumentUploaded, aggregateId: documentId });
      expect(event?.payload).toEqual({
        documentId,
        ownerStudentId: stellaId,
        kind: PDF.kind,
        mime: PDF.mime,
        sizeBytes: PDF.sizeBytes,
        uploadedBy: stella.userId,
      });
      await http
        .post(`/v1/documents/${documentId}/complete`)
        .set(stella.headers)
        .expect(StatusCodes.OK);
      expect(
        await expectEvents(db, { type: DocumentUploaded, aggregateId: documentId }),
      ).toHaveLength(1);
      const rows = await system.query<{ storage_key: string; status: string }>(
        `select storage_key, status from documents where id = $1`,
        [documentId],
      );
      expect(rows.rows[0]).toEqual({ storage_key: `${A.schoolId}/${documentId}`, status: 'ready' });
    });

    it('validates kind, mime and size', async () => {
      for (const body of [
        { ...PDF, mime: 'application/x-msdownload' },
        { ...PDF, sizeBytes: 20 * 1024 * 1024 + 1 },
        { ...PDF, kind: 'selfie' },
      ]) {
        const res = await http.post('/v1/documents/upload-url').set(stella.headers).send(body);
        expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      }
    });

    it("refuses a student uploading to another student's record", async () => {
      const res = await http
        .post('/v1/documents/upload-url')
        .set(stella.headers)
        .send({ ...PDF, ownerStudentId: ottoId });
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });

    it('lets an instructor upload only for assigned students, naming the student', async () => {
      const unnamed = await http.post('/v1/documents/upload-url').set(ingo.headers).send(PDF);
      expect(unnamed.status).toBe(StatusCodes.BAD_REQUEST);
      await uploadAs(ingo, { ...PDF, ownerStudentId: stellaId });
      const other = await http
        .post('/v1/documents/upload-url')
        .set(ingo.headers)
        .send({ ...PDF, ownerStudentId: ottoId });
      expect(other.status).toBe(StatusCodes.FORBIDDEN);
    });

    it('lets office upload for any student of the school but not for another school', async () => {
      await uploadAs(office, { ...PDF, ownerStudentId: ottoId });
      const bStudent = await createStudent(tenants, B, { dateOfBirth: '2000-01-01' });
      const res = await http
        .post('/v1/documents/upload-url')
        .set(office.headers)
        .send({ ...PDF, ownerStudentId: bStudent });
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
    });

    it('does not let a parent upload without a grant', async () => {
      const res = await http
        .post('/v1/documents/upload-url')
        .set(paula.headers)
        .send({ ...PDF, ownerStudentId: stellaId });
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });

    it("does not let someone else complete a student's upload", async () => {
      const upload = await uploadAs(stella);
      const res = await http.post(`/v1/documents/${upload.documentId}/complete`).set(otto.headers);
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
    });
  });

  describe('list and download across roles and tenants', () => {
    let stellaDoc: string;
    let ottoDoc: string;
    let schoolDoc: string;
    let pendingDoc: string;

    beforeAll(async () => {
      stellaDoc = await uploadedDocument(stella);
      ottoDoc = await uploadedDocument(otto);
      schoolDoc = await createDocumentRow(tenants, A, { ownerStudentId: null });
      pendingDoc = await createDocumentRow(tenants, A, {
        ownerStudentId: stellaId,
        status: 'pending',
      });
    });

    const listIds = async (headers: Record<string, string>, query: Record<string, string> = {}) => {
      const res = await http.get('/v1/documents').set(headers).query(query);
      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.OK);
      return (res.body.items as { id: string }[]).map((item) => item.id);
    };

    it('shows office every document of the school and audits the students read', async () => {
      const ids = await listIds(office.headers, { limit: '200' });
      expect(ids).toEqual(expect.arrayContaining([stellaDoc, ottoDoc, schoolDoc, pendingDoc]));
      const filtered = await listIds(office.headers, { ownerStudentId: ottoId });
      expect(filtered).toContain(ottoDoc);
      expect(filtered).not.toContain(stellaDoc);
      expect(await auditRows(ottoId)).toContainEqual({
        action: 'student.documents.read',
        actor_user_id: office.userId,
      });
    });

    it('shows a student only their own documents, with the uploader name', async () => {
      const res = await http.get('/v1/documents').set(stella.headers);
      const ids = (res.body.items as { id: string }[]).map((item) => item.id);
      expect(ids).toContain(stellaDoc);
      expect(ids).not.toContain(ottoDoc);
      expect(ids).not.toContain(schoolDoc);
      const other = await http
        .get('/v1/documents')
        .set(stella.headers)
        .query({ ownerStudentId: ottoId });
      expect(other.status).toBe(StatusCodes.NOT_FOUND);
      expect(await auditRows(stellaId)).not.toContainEqual(
        expect.objectContaining({ actor_user_id: stella.userId }),
      );
    });

    it("shows a parent the linked student's documents only", async () => {
      const ids = await listIds(paula.headers);
      expect(ids).toContain(stellaDoc);
      expect(ids).not.toContain(ottoDoc);
    });

    it('shows an instructor the documents of assigned students only', async () => {
      const ids = await listIds(ingo.headers);
      expect(ids).toContain(stellaDoc);
      expect(ids).not.toContain(ottoDoc);
      expect(ids).not.toContain(schoolDoc);
    });

    it('shows school B nothing of school A', async () => {
      const ids = await listIds(authHeaders(B), { limit: '200' });
      expect(ids).not.toContain(stellaDoc);
      expect(ids).not.toContain(schoolDoc);
    });

    it('gives the owner a 5 minute download URL without auditing the student', async () => {
      const before = Date.now();
      const res = await http.get(`/v1/documents/${stellaDoc}/download-url`).set(stella.headers);
      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.OK);
      const expiresAt = Date.parse(res.body.expiresAt as string);
      expect(expiresAt - before).toBeGreaterThanOrEqual(4.9 * MINUTE_MS);
      expect(expiresAt - before).toBeLessThanOrEqual(5.1 * MINUTE_MS);
      expect(kernel.storage.download(res.body.url as string)).toMatchObject({ ok: true });
      expect(await auditRows(stellaDoc)).toEqual([]);
    });

    it('audits staff and instructor downloads', async () => {
      await http
        .get(`/v1/documents/${stellaDoc}/download-url`)
        .set(office.headers)
        .expect(StatusCodes.OK);
      await http
        .get(`/v1/documents/${stellaDoc}/download-url`)
        .set(ingo.headers)
        .expect(StatusCodes.OK);
      expect(await auditRows(stellaDoc)).toEqual([
        { action: 'document.download', actor_user_id: office.userId },
        { action: 'document.download', actor_user_id: ingo.userId },
      ]);
    });

    it('hides documents the caller may not see', async () => {
      for (const [headers, id] of [
        [stella.headers, ottoDoc],
        [paula.headers, ottoDoc],
        [ingo.headers, ottoDoc],
        [stella.headers, schoolDoc],
        [authHeaders(B), stellaDoc],
      ] as const) {
        const res = await http.get(`/v1/documents/${id}/download-url`).set(headers);
        expect(res.status).toBe(StatusCodes.NOT_FOUND);
      }
    });

    it('does not sign a download for an upload that has not finished', async () => {
      const res = await http.get(`/v1/documents/${pendingDoc}/download-url`).set(office.headers);
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error.code).toBe('document_not_ready');
    });

    it('rejects a download URL once it has expired', async () => {
      const issuedAt = Date.now();
      kernel.storage.setClock(() => new Date(issuedAt));
      try {
        const res = await http.get(`/v1/documents/${stellaDoc}/download-url`).set(stella.headers);
        expect(res.status).toBe(StatusCodes.OK);
        const url = res.body.url as string;
        kernel.storage.setClock(() => new Date(issuedAt + 5 * MINUTE_MS - 1000));
        expect(kernel.storage.download(url)).toMatchObject({ ok: true });
        kernel.storage.setClock(() => new Date(issuedAt + 5 * MINUTE_MS + 1000));
        expect(kernel.storage.download(url)).toEqual({ ok: false, reason: 'expired' });
      } finally {
        kernel.storage.setClock(() => new Date());
      }
    });
  });
  describe('instructor visibility through recent lessons', () => {
    const DAY_MS = 86_400_000;
    let ivy: Login;
    const docs: Record<'recent' | 'old' | 'cancelled' | 'upcoming', string> = {
      recent: '',
      old: '',
      cancelled: '',
      upcoming: '',
    };

    beforeAll(async () => {
      ivy = await createLogin(tenants, A, ['instructor']);
      const lessonTypeId = await insertLessonType(tenants, A);
      const taught = async (daysFromNow: number, status: 'completed' | 'cancelled' | 'booked') => {
        const studentId = await createStudent(tenants, A, { dateOfBirth: '2000-01-01' });
        await insertLesson(tenants, A, {
          studentId,
          instructorMembershipId: ivy.membershipId,
          lessonTypeId,
          start: new Date(Date.now() + daysFromNow * DAY_MS).toISOString(),
          status,
        });
        return createDocumentRow(tenants, A, { ownerStudentId: studentId, status: 'ready' });
      };
      docs.recent = await taught(-30, 'completed');
      docs.old = await taught(-120, 'completed');
      docs.cancelled = await taught(-10, 'cancelled');
      docs.upcoming = await taught(5, 'booked');
    });

    it('lists the documents of students taught in the last 90 days or booked ahead', async () => {
      const res = await http.get('/v1/documents').set(ivy.headers).query({ limit: '200' });
      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.OK);
      const ids = (res.body.items as { id: string }[]).map((item) => item.id);
      expect(ids).toEqual(expect.arrayContaining([docs.recent, docs.upcoming]));
      expect(ids).not.toContain(docs.old);
      expect(ids).not.toContain(docs.cancelled);
    });

    it('lets the instructor download a recent student document but not an old one', async () => {
      const recent = await http.get(`/v1/documents/${docs.recent}/download-url`).set(ivy.headers);
      expect(recent.status, JSON.stringify(recent.body)).toBe(StatusCodes.OK);
      const old = await http.get(`/v1/documents/${docs.old}/download-url`).set(ivy.headers);
      expect(old.status).toBe(StatusCodes.NOT_FOUND);
    });
  });
});
