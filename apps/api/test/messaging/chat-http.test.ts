import { MessageSent } from '@driveos/shared';
import { eq } from 'drizzle-orm';
import { StatusCodes } from 'http-status-codes';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { students } from '../../src/modules/training/infra/schema.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createStudent } from '../identity/support.js';
import { expectEvents } from '../support/events.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import { assignInstructor, createLogin, linkGuardianRow, type Login } from '../training/support.js';
import { createConversationRow, createMessageRow } from './support.js';

interface ConversationBody {
  id: string;
  kind: string;
  studentId: string;
  instructorMembershipId: string | null;
  readOnly: boolean;
  schoolCanRead: boolean;
  unreadCount: number;
  lastReadMessageId: string | null;
  lastMessage: { id: string; preview: string } | null;
}

describe('chat HTTP', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let http: ReturnType<typeof request>;
  let owner: Record<string, string>;
  let office: Login;
  let ingo: Login;
  let ina: Login;
  let stella: Login;
  let otto: Login;
  let paula: Login;
  let stellaId: string;
  let ottoId: string;
  let schoolChat: string;
  let instructorChat: string;
  let ottoChat: string;

  beforeAll(async () => {
    db = await createScratchDatabase();
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A } = tenants);
    http = request(kernel.app.getHttpServer());
    owner = authHeaders(A);
    office = await createLogin(tenants, A, ['office']);
    ingo = await createLogin(tenants, A, ['instructor']);
    ina = await createLogin(tenants, A, ['instructor']);
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
    schoolChat = await createConversationRow(tenants, A, { studentId: stellaId });
    instructorChat = await createConversationRow(tenants, A, {
      studentId: stellaId,
      instructorMembershipId: ingo.membershipId,
    });
    ottoChat = await createConversationRow(tenants, A, { studentId: ottoId });
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  async function list(headers: Record<string, string>, query: Record<string, string> = {}) {
    const res = await http.get('/v1/conversations').query(query).set(headers);
    expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.OK);
    return res.body as { items: ConversationBody[]; nextCursor: string | null };
  }

  async function send(headers: Record<string, string>, conversationId: string, body: string) {
    return http.post(`/v1/conversations/${conversationId}/messages`).set(headers).send({ body });
  }

  async function sent(headers: Record<string, string>, conversationId: string, body: string) {
    const res = await send(headers, conversationId, body);
    expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.CREATED);
    return res.body as { id: string; senderUserId: string; body: string; conversationId: string };
  }

  describe('office can read but not post in instructor chats (D5)', () => {
    it('lists the instructor chat read-only with the school-can-read notice', async () => {
      const { items } = await list(office.headers, { studentId: stellaId });
      const byId = new Map(items.map((item) => [item.id, item]));
      expect(byId.get(instructorChat)).toMatchObject({
        kind: 'student_instructor',
        instructorMembershipId: ingo.membershipId,
        readOnly: true,
        schoolCanRead: true,
      });
      expect(byId.get(schoolChat)).toMatchObject({ readOnly: false, schoolCanRead: false });
    });

    it('reads the messages but gets 403 chat_read_only when posting', async () => {
      const message = await sent(ingo.headers, instructorChat, 'See you at 8');
      const read = await http
        .get(`/v1/conversations/${instructorChat}/messages`)
        .set(office.headers);
      expect(read.status, JSON.stringify(read.body)).toBe(StatusCodes.OK);
      expect(read.body.items.map((item: { id: string }) => item.id)).toContain(message.id);

      for (const headers of [office.headers, owner]) {
        const post = await send(headers, instructorChat, 'Office here');
        expect(post.status).toBe(StatusCodes.FORBIDDEN);
        expect(post.body.error.code).toBe('chat_read_only');
      }
    });

    it('lets office mark the instructor chat read', async () => {
      const message = await sent(stella.headers, instructorChat, 'Thanks!');
      const res = await http
        .post(`/v1/conversations/${instructorChat}/read`)
        .set(office.headers)
        .send({ lastReadMessageId: message.id });
      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.OK);
      expect(res.body).toEqual({
        conversationId: instructorChat,
        lastReadMessageId: message.id,
        unreadCount: 0,
      });
    });
  });

  describe('participants', () => {
    it('sends an instructor message to the student, not to the office', async () => {
      const message = await sent(ingo.headers, instructorChat, '  Bring your glasses  ');
      expect(message).toMatchObject({
        conversationId: instructorChat,
        senderUserId: ingo.userId,
        body: 'Bring your glasses',
      });
      const [event] = await expectEvents(db, { type: MessageSent, aggregateId: message.id });
      expect(event?.payload).toMatchObject({
        conversationId: instructorChat,
        conversationKind: 'student_instructor',
        senderUserId: ingo.userId,
        preview: 'Bring your glasses',
      });
      expect(event?.payload.recipientUserIds).toEqual([stella.userId]);
    });

    it('sends a student message in the school chat to owner and office', async () => {
      const message = await sent(stella.headers, schoolChat, 'Can I move my lesson?');
      const [event] = await expectEvents(db, { type: MessageSent, aggregateId: message.id });
      expect([...(event?.payload.recipientUserIds ?? [])].sort()).toEqual(
        [A.ownerUserId, office.userId].sort(),
      );
    });

    it('shows students only their own chats and gives parents no chat access', async () => {
      const ids = (await list(stella.headers)).items.map((item) => item.id).sort();
      expect(ids).toEqual([schoolChat, instructorChat].sort());
      const parent = await http.get('/v1/conversations').set(paula.headers);
      expect(parent.status).toBe(StatusCodes.FORBIDDEN);
      expect((await list(otto.headers)).items.map((item) => item.id)).toEqual([ottoChat]);
      const res = await http.get(`/v1/conversations/${ottoChat}/messages`).set(stella.headers);
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
      expect((await send(stella.headers, ottoChat, 'Hi')).status).toBe(StatusCodes.NOT_FOUND);
    });

    it('shows instructors only their own instructor chats', async () => {
      const mine = await list(ingo.headers);
      expect(mine.items.map((item) => item.id)).toEqual([instructorChat]);
      expect(mine.items[0]).toMatchObject({ readOnly: false, schoolCanRead: true });
      expect((await list(ina.headers)).items).toEqual([]);
      for (const id of [schoolChat, instructorChat]) {
        const res = await http.get(`/v1/conversations/${id}/messages`).set(ina.headers);
        expect(res.status).toBe(StatusCodes.NOT_FOUND);
      }
      expect((await send(ingo.headers, schoolChat, 'Hi')).status).toBe(StatusCodes.NOT_FOUND);
    });

    it('filters by kind', async () => {
      const { items } = await list(office.headers, { kind: 'student_school' });
      expect(items.every((item) => item.kind === 'student_school')).toBe(true);
      expect(items.map((item) => item.id)).toEqual(expect.arrayContaining([schoolChat, ottoChat]));
    });
  });

  describe('read state', () => {
    it('counts unread messages from others and never moves the pointer backwards', async () => {
      const ivo = await createLogin(tenants, A, ['instructor']);
      await assignInstructor(tenants, A, stellaId, ivo.membershipId, false);
      const chat = await createConversationRow(tenants, A, {
        studentId: stellaId,
        instructorMembershipId: ivo.membershipId,
      });
      const first = await sent(stella.headers, chat, 'one');
      const second = await sent(stella.headers, chat, 'two');
      await sent(ivo.headers, chat, 'mine');
      const before = (await list(ivo.headers)).items.find((item) => item.id === chat);
      expect(before).toMatchObject({ unreadCount: 0, lastReadMessageId: expect.any(String) });

      const studentView = (await list(stella.headers)).items.find((item) => item.id === chat);
      expect(studentView).toMatchObject({ unreadCount: 1, lastReadMessageId: second.id });
      expect(studentView?.lastMessage?.preview).toBe('mine');

      const back = await http
        .post(`/v1/conversations/${chat}/read`)
        .set(stella.headers)
        .send({ lastReadMessageId: first.id });
      expect(back.status, JSON.stringify(back.body)).toBe(StatusCodes.OK);
      expect(back.body).toMatchObject({ lastReadMessageId: second.id, unreadCount: 1 });
    });

    it('rejects a message from another conversation with 400', async () => {
      const other = await createMessageRow(tenants, A, {
        conversationId: ottoChat,
        senderUserId: otto.userId,
      });
      const res = await http
        .post(`/v1/conversations/${schoolChat}/read`)
        .set(stella.headers)
        .send({ lastReadMessageId: other });
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
    });
  });

  describe('paging', () => {
    it('lists messages newest first with a cursor', async () => {
      const studentId = await createStudent(tenants, A, { dateOfBirth: '2000-01-01' });
      const chat = await createConversationRow(tenants, A, { studentId });
      const base = Date.now() - 60_000;
      const ids: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        ids.push(
          await createMessageRow(tenants, A, {
            conversationId: chat,
            senderUserId: otto.userId,
            body: `m${i}`,
            sentAt: new Date(base + i * 1000),
          }),
        );
      }
      const first = await http
        .get(`/v1/conversations/${chat}/messages`)
        .query({ limit: 3 })
        .set(office.headers);
      expect(first.status, JSON.stringify(first.body)).toBe(StatusCodes.OK);
      expect(first.body.items.map((item: { body: string }) => item.body)).toEqual([
        'm4',
        'm3',
        'm2',
      ]);
      expect(first.body.nextCursor).toBe(ids[2]);
      const second = await http
        .get(`/v1/conversations/${chat}/messages`)
        .query({ limit: 3, cursor: first.body.nextCursor as string })
        .set(office.headers);
      expect(second.body.items.map((item: { body: string }) => item.body)).toEqual(['m1', 'm0']);
      expect(second.body.nextCursor).toBeNull();
    });

    it('orders conversations by latest activity and pages them', async () => {
      await sent(otto.headers, ottoChat, 'latest');
      const page = await list(office.headers, { limit: '1' });
      expect(page.items.map((item) => item.id)).toEqual([ottoChat]);
      expect(page.nextCursor).toBe(ottoChat);
      const next = await list(office.headers, { limit: '1', cursor: page.nextCursor as string });
      expect(next.items).toHaveLength(1);
      expect(next.items[0]?.id).not.toBe(ottoChat);
    });
  });

  describe('read-only chats', () => {
    it('stops an unassigned instructor from posting but keeps the history readable', async () => {
      const studentId = await createStudent(tenants, A, { dateOfBirth: '2000-01-01' });
      const chat = await createConversationRow(tenants, A, {
        studentId,
        instructorMembershipId: ina.membershipId,
      });
      const view = (await list(ina.headers)).items.find((item) => item.id === chat);
      expect(view?.readOnly).toBe(true);
      const res = await send(ina.headers, chat, 'Hi');
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
      expect(res.body.error.code).toBe('chat_read_only');
      const read = await http.get(`/v1/conversations/${chat}/messages`).set(ina.headers);
      expect(read.status).toBe(StatusCodes.OK);
    });

    it("makes an archived student's chats read-only", async () => {
      const login = await createLogin(tenants, A, ['student']);
      const studentId = await createStudent(tenants, A, {
        dateOfBirth: '2000-01-01',
        userId: login.userId,
      });
      const chat = await createConversationRow(tenants, A, { studentId });
      await tenants.asSchool(A, (tx) =>
        tx.update(students).set({ status: 'archived' }).where(eq(students.id, studentId)),
      );
      const view = (await list(login.headers)).items.find((item) => item.id === chat);
      expect(view?.readOnly).toBe(true);
      expect((await send(login.headers, chat, 'Hi')).status).toBe(StatusCodes.FORBIDDEN);
      const res = await send(office.headers, chat, 'Hi');
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
      expect(res.body.error.code).toBe('chat_read_only');
    });
  });
});
