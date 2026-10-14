import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AccessTokenService } from '../../src/kernel/auth/access-token.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { invitations } from '../../src/modules/identity/infra/schema.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import { createTestTenants, type TestTenants } from '../support/tenants.js';
import {
  codeFrom,
  comparableResponse,
  createUser,
  decodeClaims,
  type TestUser,
  uniqueEmail,
  uniquePhone,
} from './support.js';
import { StatusCodes } from 'http-status-codes';

describe('one-time-code login', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    kernel = await createKernelTestApp(db, [], { env: { AUTH_CODES_PER_IP: '1000' } });
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    http = request(kernel.app.getHttpServer());
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  afterEach(() => {
    kernel.sms.clear();
    kernel.email.clear();
  });

  const requestCode = (contact: string) => http.post('/v1/auth/code').send({ contact });
  const verify = (contact: string, code: string, client: 'web' | 'mobile' = 'web') =>
    http.post('/v1/auth/verify').send({ contact, code, client });

  const owner = (roles = ['student']) =>
    createUser(tenants, { phone: uniquePhone(), memberships: [{ tenant: tenants.A, roles }] });

  async function smsCodeFor(user: TestUser): Promise<string> {
    await requestCode(user.phone ?? '').expect(StatusCodes.ACCEPTED);
    expect(kernel.sms.last()?.to).toBe(user.phone);
    return codeFrom(kernel.sms.last()?.body);
  }

  const otpRows = async (contact: string) =>
    (
      await system.query<{
        code_hash: string;
        attempts: number;
        expires_at: Date;
        consumed_at: Date | null;
      }>(
        `select code_hash, attempts, expires_at, consumed_at from otp_codes
          where contact = $1 order by created_at, id`,
        [contact],
      )
    ).rows;

  describe('POST /v1/auth/code', () => {
    it('sends a 6-digit code by SMS to a known phone and stores only its hash', async () => {
      const user = await owner();
      const before = Date.now();

      const res = await requestCode(user.phone ?? '').expect(StatusCodes.ACCEPTED);

      expect(res.body).toEqual({});
      expect(kernel.sms.sent).toHaveLength(1);
      expect(kernel.email.sent).toHaveLength(0);
      const code = codeFrom(kernel.sms.last()?.body);
      expect(kernel.sms.last()?.body).toContain('expires in 5 minutes');
      const [row] = await otpRows(user.phone ?? '');
      expect(row?.attempts).toBe(0);
      expect(row?.consumed_at).toBeNull();
      expect(row?.code_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(row?.code_hash).not.toContain(code);
      const ttl = (row?.expires_at.getTime() ?? 0) - before;
      expect(ttl).toBeGreaterThan(299_000);
      expect(ttl).toBeLessThan(302_000);
    });

    it('normalises a formatted phone number before looking it up', async () => {
      const phone = uniquePhone();
      await createUser(tenants, {
        phone,
        memberships: [{ tenant: tenants.A, roles: ['student'] }],
      });

      await requestCode(`00${phone.slice(1, 3)} ${phone.slice(3, 7)} ${phone.slice(7)}`).expect(
        StatusCodes.ACCEPTED,
      );

      expect(kernel.sms.last()?.to).toBe(phone);
    });

    it('sends the code by email to a known email, matched case-insensitively', async () => {
      const email = uniqueEmail();
      await createUser(tenants, { email, memberships: [{ tenant: tenants.A, roles: ['office'] }] });

      await requestCode(email.toUpperCase()).expect(StatusCodes.ACCEPTED);

      expect(kernel.sms.sent).toHaveLength(0);
      expect(kernel.email.sent).toHaveLength(1);
      const sent = kernel.email.last();
      expect(sent?.to).toBe(email);
      expect(sent?.subject).toBe('Your DriveOS sign-in code');
      expect(codeFrom(sent?.text)).toMatch(/^\d{6}$/);
    });

    it('sends nothing to an unknown contact, and the response is identical', async () => {
      const known = await owner();

      const knownRes = await requestCode(known.phone ?? '');
      const unknownPhone = uniquePhone();
      const unknownRes = await requestCode(unknownPhone);
      const unknownEmailRes = await requestCode(uniqueEmail());

      expect(kernel.sms.sent.map((m) => m.to)).toEqual([known.phone]);
      expect(kernel.email.sent).toEqual([]);
      expect(await otpRows(unknownPhone)).toEqual([]);
      expect(comparableResponse(unknownRes)).toEqual(comparableResponse(knownRes));
      expect(comparableResponse(unknownEmailRes)).toEqual(comparableResponse(knownRes));
    });

    it('sends nothing to a user whose memberships are all disabled or pending', async () => {
      const disabled = await createUser(tenants, {
        phone: uniquePhone(),
        memberships: [{ tenant: tenants.A, roles: ['student'], status: 'disabled' }],
      });
      const pending = await createUser(tenants, {
        phone: uniquePhone(),
        memberships: [{ tenant: tenants.A, roles: ['student'], status: 'pending_consent' }],
      });

      await requestCode(disabled.phone ?? '').expect(StatusCodes.ACCEPTED);
      await requestCode(pending.phone ?? '').expect(StatusCodes.ACCEPTED);

      expect(kernel.sms.sent).toEqual([]);
    });

    it('sends a code to a platform admin without memberships', async () => {
      const admin = await createUser(tenants, { phone: uniquePhone(), platformAdmin: true });

      await requestCode(admin.phone ?? '').expect(StatusCodes.ACCEPTED);

      expect(kernel.sms.last()?.to).toBe(admin.phone);
    });

    it('rejects a contact that is neither a phone number nor an email with 400', async () => {
      const res = await requestCode('not a contact').expect(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe('validation_error');
      await http.post('/v1/auth/code').send({}).expect(StatusCodes.BAD_REQUEST);
    });
  });

  describe('POST /v1/auth/verify', () => {
    it('returns tokens and selects the only active membership automatically', async () => {
      const user = await owner(['student']);
      const code = await smsCodeFor(user);

      const res = await verify(user.phone ?? '', code).expect(StatusCodes.OK);

      expect(res.body).toEqual({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        expiresIn: 900,
        memberships: [
          {
            membershipId: user.membershipIds[0],
            schoolId: tenants.A.schoolId,
            schoolName: 'School A',
            roles: ['student'],
            status: 'active',
          },
        ],
        activeMembershipId: user.membershipIds[0],
      });
      const verified = await kernel.app.get(AccessTokenService).verify(res.body.accessToken);
      expect(verified).toEqual({
        ok: true,
        principal: {
          userId: user.userId,
          membershipId: user.membershipIds[0],
          schoolId: tenants.A.schoolId,
          roles: ['student'],
          tokenType: 'access',
          sessionId: null,
        },
      });
      const [otp] = await otpRows(user.phone ?? '');
      expect(otp?.consumed_at).not.toBeNull();
    });

    it('stores a hashed web refresh token for 30 days and a mobile one for 90 days', async () => {
      const user = await owner();
      const web = await verify(user.phone ?? '', await smsCodeFor(user), 'web').expect(
        StatusCodes.OK,
      );
      const mobile = await verify(user.phone ?? '', await smsCodeFor(user), 'mobile').expect(
        StatusCodes.OK,
      );

      const { rows } = await system.query<{
        client: string;
        days: number;
        token_hash: string;
        membership_id: string;
        family_id: string;
      }>(
        `select client, round(extract(epoch from expires_at - now()) / 86400)::int as days,
                token_hash, membership_id, family_id
           from refresh_tokens where user_id = $1 order by created_at`,
        [user.userId],
      );
      expect(rows.map((r) => [r.client, r.days, r.membership_id])).toEqual([
        ['web', 30, user.membershipIds[0]],
        ['mobile', 90, user.membershipIds[0]],
      ]);
      expect(rows[0]?.family_id).not.toBe(rows[1]?.family_id);
      for (const row of rows) {
        expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
        expect([web.body.refreshToken, mobile.body.refreshToken]).not.toContain(row.token_hash);
      }
    });

    it('leaves the school unselected for a user with several active memberships', async () => {
      const user = await createUser(tenants, {
        phone: uniquePhone(),
        memberships: [
          { tenant: tenants.A, roles: ['instructor'] },
          { tenant: tenants.B, roles: ['student'] },
        ],
      });

      const res = await verify(user.phone ?? '', await smsCodeFor(user)).expect(StatusCodes.OK);

      expect(res.body.activeMembershipId).toBeNull();
      expect(res.body.memberships).toHaveLength(2);
      expect(decodeClaims(res.body.accessToken)).toMatchObject({
        sub: user.userId,
        mid: null,
        sid: null,
        roles: [],
        typ: 'access',
      });
    });

    it('gives a platform admin without memberships a token with no school', async () => {
      const admin = await createUser(tenants, { phone: uniquePhone(), platformAdmin: true });

      const res = await verify(admin.phone ?? '', await smsCodeFor(admin)).expect(StatusCodes.OK);

      expect(res.body.memberships).toEqual([]);
      expect(decodeClaims(res.body.accessToken)).toMatchObject({
        sub: admin.userId,
        sid: null,
        mid: null,
        roles: ['platform_admin'],
      });
    });

    it('puts every role of an owner+instructor membership into the token', async () => {
      const user = await owner(['owner', 'instructor']);

      const res = await verify(user.phone ?? '', await smsCodeFor(user)).expect(StatusCodes.OK);

      expect(decodeClaims(res.body.accessToken).roles).toEqual(['owner', 'instructor']);
    });

    it('kills the code after 5 wrong attempts, even for the right code afterwards', async () => {
      const user = await owner();
      const code = await smsCodeFor(user);
      const wrong = code === '000000' ? '111111' : '000000';

      for (let i = 0; i < 5; i += 1) {
        const res = await verify(user.phone ?? '', wrong).expect(StatusCodes.UNAUTHORIZED);
        expect(res.body.error.code).toBe('invalid_code');
      }
      const res = await verify(user.phone ?? '', code).expect(StatusCodes.UNAUTHORIZED);

      expect(res.body.error.code).toBe('invalid_code');
      const [row] = await otpRows(user.phone ?? '');
      expect(row?.attempts).toBe(5);
      expect(row?.consumed_at).toBeNull();
    });

    it('accepts the right code after fewer than 5 wrong attempts', async () => {
      const user = await owner();
      const code = await smsCodeFor(user);
      const wrong = code === '000000' ? '111111' : '000000';

      for (let i = 0; i < 4; i += 1)
        await verify(user.phone ?? '', wrong).expect(StatusCodes.UNAUTHORIZED);

      await verify(user.phone ?? '', code).expect(StatusCodes.OK);
    });

    it('rejects an expired code with 401 code_expired', async () => {
      const user = await owner();
      const code = await smsCodeFor(user);
      await system.query(
        `update otp_codes set expires_at = now() - interval '1 second' where contact = $1`,
        [user.phone],
      );

      const res = await verify(user.phone ?? '', code).expect(StatusCodes.UNAUTHORIZED);

      expect(res.body.error).toEqual({ code: 'code_expired', message: expect.any(String) });
    });

    it('accepts a code only once', async () => {
      const user = await owner();
      const code = await smsCodeFor(user);
      await verify(user.phone ?? '', code).expect(StatusCodes.OK);

      const res = await verify(user.phone ?? '', code).expect(StatusCodes.UNAUTHORIZED);

      expect(res.body.error.code).toBe('invalid_code');
    });

    it('invalidates the earlier code when a new one is requested', async () => {
      const user = await owner();
      const first = await smsCodeFor(user);
      const second = await smsCodeFor(user);
      if (first !== second) {
        expect(
          (await verify(user.phone ?? '', first).expect(StatusCodes.UNAUTHORIZED)).body.error.code,
        ).toBe('invalid_code');
      }

      await verify(user.phone ?? '', second).expect(StatusCodes.OK);
    });

    it('rejects a code for a contact that never requested one', async () => {
      const res = await verify(uniquePhone(), '123456').expect(StatusCodes.UNAUTHORIZED);
      expect(res.body.error.code).toBe('invalid_code');
    });

    it('answers 403 no_account for an invited contact that has no user yet', async () => {
      const phone = uniquePhone();
      await tenants.asSchool(tenants.A, (tx) =>
        tx.insert(invitations).values({
          schoolId: tenants.A.schoolId,
          roles: ['student'],
          phone,
          tokenHash: randomUUID(),
          invitedBy: tenants.A.ownerUserId,
          expiresAt: new Date(Date.now() + 86_400_000),
        }),
      );
      await requestCode(phone).expect(StatusCodes.ACCEPTED);
      const code = codeFrom(kernel.sms.last()?.body);

      const res = await verify(phone, code).expect(StatusCodes.FORBIDDEN);

      expect(res.body.error.code).toBe('no_account');
    });

    it('validates the body', async () => {
      await verify('a@example.com', '12345').expect(StatusCodes.BAD_REQUEST);
      await http
        .post('/v1/auth/verify')
        .send({ contact: 'a@example.com', code: '123456' })
        .expect(StatusCodes.BAD_REQUEST);
    });
  });
});

describe('login code rate limits', () => {
  let db: ScratchDatabase;
  let tenants: TestTenants;

  beforeAll(async () => {
    db = await createScratchDatabase();
  }, 60_000);

  afterAll(async () => {
    await db?.drop();
  });

  async function withApp(
    env: Record<string, string>,
    fn: (kernel: KernelTestApp) => Promise<void>,
  ) {
    const kernel = await createKernelTestApp(db, [], { env });
    try {
      tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
      await fn(kernel);
    } finally {
      await kernel.close();
    }
  }

  const student = (phone: string) =>
    createUser(tenants, { phone, memberships: [{ tenant: tenants.A, roles: ['student'] }] });

  it('sends at most 3 codes per contact per 15 minutes; the 4th still answers 202', async () => {
    await withApp({ AUTH_CODES_PER_IP: '1000' }, async (kernel) => {
      const http = request(kernel.app.getHttpServer());
      const user = await student(uniquePhone());
      const send = () =>
        http.post('/v1/auth/code').send({ contact: user.phone }).expect(StatusCodes.ACCEPTED);
      const first = await send();
      await send();
      await send();
      const fourth = await send();

      expect(kernel.sms.sent).toHaveLength(3);
      expect(comparableResponse(fourth)).toEqual(comparableResponse(first));
      const other = await student(uniquePhone());
      await http.post('/v1/auth/code').send({ contact: other.phone }).expect(StatusCodes.ACCEPTED);
      expect(kernel.sms.sent).toHaveLength(4);
    });
  });

  it('sends at most 20 codes per IP per hour', async () => {
    await withApp({}, async (kernel) => {
      const http = request(kernel.app.getHttpServer());
      for (let i = 0; i < 20; i += 1) {
        await http
          .post('/v1/auth/code')
          .send({ contact: uniquePhone() })
          .expect(StatusCodes.ACCEPTED);
      }
      const user = await student(uniquePhone());

      await http.post('/v1/auth/code').send({ contact: user.phone }).expect(StatusCodes.ACCEPTED);

      expect(kernel.sms.sent).toEqual([]);
    });
  });

  it('caps the codes sent per destination country prefix per day', async () => {
    await withApp(
      { AUTH_CODES_PER_IP: '1000', AUTH_CODES_PER_PREFIX_PER_DAY: '2' },
      async (kernel) => {
        const http = request(kernel.app.getHttpServer());
        const germans = await Promise.all([1, 2, 3].map(() => student(uniquePhone('49155'))));
        const portuguese = await student(uniquePhone('35191'));
        const email = uniqueEmail();
        await createUser(tenants, {
          email,
          memberships: [{ tenant: tenants.A, roles: ['office'] }],
        });

        for (const user of germans) {
          await http
            .post('/v1/auth/code')
            .send({ contact: user.phone })
            .expect(StatusCodes.ACCEPTED);
        }
        await http
          .post('/v1/auth/code')
          .send({ contact: portuguese.phone })
          .expect(StatusCodes.ACCEPTED);
        await http.post('/v1/auth/code').send({ contact: email }).expect(StatusCodes.ACCEPTED);

        expect(kernel.sms.sent.map((m) => m.to)).toEqual([
          germans[0]?.phone,
          germans[1]?.phone,
          portuguese.phone,
        ]);
        expect(kernel.email.sent.map((m) => m.to)).toEqual([email]);
      },
    );
  });
});
