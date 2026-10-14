import {
  BranchChanged,
  PaymentAccountConnected,
  SchoolSettingsChanged,
  VehicleChanged,
} from '@driveos/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import {
  GetMissingBranchIdsQuery,
  GetOpeningHoursQuery,
  GetPaymentAccountQuery,
  GetSchoolSettingsQuery,
} from '../../src/modules/school/index.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { expectEventAppended, expectNoEvent } from '../support/events.js';
import { executeAs } from '../support/handlers.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  authHeadersFor,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import { StatusCodes } from 'http-status-codes';

describe('school module', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    db = await createScratchDatabase();
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A, B } = tenants);
    http = request(kernel.app.getHttpServer());
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  const asStudent = (tenant: TestTenant) => authHeadersFor(tenant, { roles: ['student'] });

  async function createBranch(tenant: TestTenant, name = 'Mitte'): Promise<string> {
    const res = await http
      .post('/v1/branches')
      .set(authHeaders(tenant))
      .send({ name, address: 'Torstr. 1, Berlin', lat: 52.53, lng: 13.4 });
    expect(res.status).toBe(StatusCodes.CREATED);
    return res.body.id as string;
  }

  async function createVehicle(tenant: TestTenant, branchId: string, plate: string) {
    const res = await http.post('/v1/vehicles').set(authHeaders(tenant)).send({
      branchId,
      plate,
      makeModel: 'VW Golf',
      transmission: 'manual',
      licenceClass: 'B',
    });
    expect(res.status).toBe(StatusCodes.CREATED);
    return res.body.id as string;
  }

  describe('profile', () => {
    it('returns the school profile without a payment account yet', async () => {
      const res = await http.get('/v1/school').set(authHeaders(A)).expect(StatusCodes.OK);
      expect(res.body).toMatchObject({ id: A.schoolId, status: 'active', paymentAccount: null });
      expect(res.body.timeZone).toEqual(expect.any(String));
    });

    it('updates the profile, bumps the version and emits SchoolSettingsChanged', async () => {
      const res = await http
        .patch('/v1/school')
        .set(authHeaders(A))
        .send({ legalName: 'Fahrschule A GmbH', taxId: 'DE123', timeZone: 'Europe/Lisbon' })
        .expect(StatusCodes.OK);
      expect(res.body).toEqual({ id: A.schoolId, version: 2 });
      const event = await expectEventAppended(db, {
        type: SchoolSettingsChanged,
        aggregateId: A.schoolId,
      });
      expect(event.aggregateVersion).toBe(2);
      expect(event.payload).toMatchObject({
        schoolId: A.schoolId,
        changedFields: ['legalName', 'taxId', 'timeZone'],
        timeZone: 'Europe/Lisbon',
      });
      const school = await http.get('/v1/school').set(authHeaders(A)).expect(StatusCodes.OK);
      expect(school.body).toMatchObject({ legalName: 'Fahrschule A GmbH', taxId: 'DE123' });
    });

    it('rejects a time zone that is not IANA', async () => {
      const res = await http
        .patch('/v1/school')
        .set(authHeaders(A))
        .send({ timeZone: 'Mars/Olympus' })
        .expect(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe('validation_error');
    });

    it('lets only owners change the profile', async () => {
      await http
        .patch('/v1/school')
        .set(asStudent(A))
        .send({ name: 'X' })
        .expect(StatusCodes.FORBIDDEN);
    });

    it("an owner of B only ever changes B's profile", async () => {
      await http
        .patch('/v1/school')
        .set(authHeaders(B))
        .send({ name: 'Only B' })
        .expect(StatusCodes.OK);
      const a = await http.get('/v1/school').set(authHeaders(A)).expect(StatusCodes.OK);
      const b = await http.get('/v1/school').set(authHeaders(B)).expect(StatusCodes.OK);
      expect(a.body.name).not.toBe('Only B');
      expect(b.body).toMatchObject({ id: B.schoolId, name: 'Only B' });
    });
  });

  describe('settings', () => {
    it('returns the defaults', async () => {
      const res = await http.get('/v1/school/settings').set(authHeaders(B)).expect(StatusCodes.OK);
      expect(res.body).toEqual({
        cancellationWindowHours: 24,
        allowNegativeBalance: false,
        minGapMinutes: 0,
        ageOfMajority: 18,
        quietHoursStart: '21:00',
        quietHoursEnd: '08:00',
        slotOfferTtlMinutes: 120,
        theoryPremiumFree: false,
        chatRetentionMonths: 24,
      });
    });

    it('updates settings and emits SchoolSettingsChanged with the full settings', async () => {
      const res = await http
        .patch('/v1/school/settings')
        .set(authHeaders(A))
        .send({ cancellationWindowHours: 48, quietHoursStart: '22:30' })
        .expect(StatusCodes.OK);
      expect(res.body.id).toBe(A.schoolId);
      const event = await expectEventAppended(db, {
        type: SchoolSettingsChanged,
        aggregateId: A.schoolId,
      });
      expect(event.aggregateVersion).toBe(res.body.version);
      expect(event.payload.changedFields).toEqual(['cancellationWindowHours', 'quietHoursStart']);
      expect(event.payload.settings).toMatchObject({
        cancellationWindowHours: 48,
        quietHoursStart: '22:30',
      });
      const settings = await executeAs(kernel.app, A, new GetSchoolSettingsQuery());
      expect(settings.cancellationWindowHours).toBe(48);
    });

    it.each([
      { cancellationWindowHours: -1 },
      { ageOfMajority: 30 },
      { quietHoursEnd: '25:00' },
      { slotOfferTtlMinutes: 0 },
      {},
    ])('rejects %j', async (body) => {
      await http
        .patch('/v1/school/settings')
        .set(authHeaders(A))
        .send(body)
        .expect(StatusCodes.BAD_REQUEST);
    });
  });

  describe('opening hours', () => {
    it('replaces the whole set atomically', async () => {
      const branchId = await createBranch(A, 'Opening');
      const items = [
        { branchId: null, weekday: 1, opens: '08:00', closes: '12:00' },
        { branchId: null, weekday: 1, opens: '13:00', closes: '18:00' },
        { branchId, weekday: 6, opens: '09:00', closes: '14:00' },
      ];
      const res = await http
        .put('/v1/school/opening-hours')
        .set(authHeaders(A))
        .send({ items })
        .expect(StatusCodes.OK);
      expect(res.body.items).toHaveLength(3);
      expect(res.body.items.map(({ id: _id, ...row }: { id: string }) => row)).toEqual(items);

      const overlapping = await http
        .put('/v1/school/opening-hours')
        .set(authHeaders(A))
        .send({
          items: [
            { branchId: null, weekday: 2, opens: '08:00', closes: '12:00' },
            { branchId: null, weekday: 2, opens: '11:00', closes: '15:00' },
          ],
        })
        .expect(StatusCodes.BAD_REQUEST);
      expect(overlapping.body.error.code).toBe('validation_error');

      await http
        .put('/v1/school/opening-hours')
        .set(authHeaders(A))
        .send({
          items: [
            { branchId: null, weekday: 3, opens: '08:00', closes: '12:00' },
            {
              branchId: '0192f000-0005-7000-8000-00000000ffff',
              weekday: 3,
              opens: '08:00',
              closes: '12:00',
            },
          ],
        })
        .expect(StatusCodes.NOT_FOUND);

      const current = await http
        .get('/v1/school/opening-hours')
        .set(authHeaders(A))
        .expect(StatusCodes.OK);
      expect(current.body).toEqual(res.body);
      const forBranch = await executeAs(kernel.app, A, new GetOpeningHoursQuery(branchId));
      expect(forBranch.items).toHaveLength(3);
      const event = await expectEventAppended(db, {
        type: SchoolSettingsChanged,
        aggregateId: A.schoolId,
      });
      expect(event.payload.changedFields).toEqual(['openingHours']);
    });

    it("does not accept B's branch in A's opening hours", async () => {
      const branchOfB = await createBranch(B, 'B only');
      await http
        .put('/v1/school/opening-hours')
        .set(authHeaders(A))
        .send({ items: [{ branchId: branchOfB, weekday: 1, opens: '08:00', closes: '09:00' }] })
        .expect(StatusCodes.NOT_FOUND);
    });
  });

  describe('branches', () => {
    it('creates, lists and updates branches with BranchChanged events', async () => {
      const id = await createBranch(A, 'Kreuzberg');
      const created = await expectEventAppended(db, { type: BranchChanged, aggregateId: id });
      expect(created.payload).toMatchObject({ branchId: id, change: 'created', name: 'Kreuzberg' });

      const updated = await http
        .patch(`/v1/branches/${id}`)
        .set(authHeaders(A))
        .send({ name: 'Kreuzberg Süd' })
        .expect(StatusCodes.OK);
      expect(updated.body).toEqual({ id, version: 2 });
      const event = await expectEventAppended(db, { type: BranchChanged, aggregateId: id });
      expect(event).toMatchObject({ aggregateVersion: 2 });
      expect(event.payload).toMatchObject({ change: 'updated', name: 'Kreuzberg Süd' });

      const list = await http
        .get('/v1/branches?limit=100')
        .set(authHeaders(A))
        .expect(StatusCodes.OK);
      expect(list.body.items).toContainEqual(
        expect.objectContaining({ id, name: 'Kreuzberg Süd', lat: 52.53, lng: 13.4 }),
      );
    });

    it('pages with a cursor', async () => {
      await createBranch(A, 'Page 1');
      await createBranch(A, 'Page 2');
      const first = await http
        .get('/v1/branches?limit=1')
        .set(authHeaders(A))
        .expect(StatusCodes.OK);
      expect(first.body.items).toHaveLength(1);
      expect(first.body.nextCursor).toEqual(expect.any(String));
      const second = await http
        .get(`/v1/branches?limit=1&cursor=${first.body.nextCursor}`)
        .set(authHeaders(A))
        .expect(StatusCodes.OK);
      expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
    });

    it("tells other modules which branch ids are not this school's", async () => {
      const own = await createBranch(A, 'Own');
      const foreign = await createBranch(B, 'Foreign');
      const missing = await executeAs(
        kernel.app,
        A,
        new GetMissingBranchIdsQuery([own, foreign, own]),
      );
      expect(missing).toEqual([foreign]);
      expect(await executeAs(kernel.app, A, new GetMissingBranchIdsQuery([]))).toEqual([]);
    });

    it('answers 404 for an unknown branch', async () => {
      await http
        .patch('/v1/branches/0192f000-0005-7000-8000-00000000ffff')
        .set(authHeaders(A))
        .send({ name: 'Nope' })
        .expect(StatusCodes.NOT_FOUND);
    });
  });

  describe('vehicles', () => {
    it('creates, filters and updates vehicles with VehicleChanged events', async () => {
      const branchId = await createBranch(A, 'Fleet');
      const id = await createVehicle(A, branchId, 'B-DO 1');
      const created = await expectEventAppended(db, { type: VehicleChanged, aggregateId: id });
      expect(created.payload).toMatchObject({ change: 'created', plate: 'B-DO 1', active: true });

      const res = await http
        .patch(`/v1/vehicles/${id}`)
        .set(authHeaders(A))
        .send({ active: false })
        .expect(StatusCodes.OK);
      expect(res.body).toEqual({ id, version: 2 });
      const updated = await expectEventAppended(db, { type: VehicleChanged, aggregateId: id });
      expect(updated.payload).toMatchObject({ change: 'updated', active: false });

      const inactive = await http
        .get(`/v1/vehicles?branchId=${branchId}&active=false`)
        .set(authHeaders(A))
        .expect(StatusCodes.OK);
      expect(inactive.body.items.map((v: { id: string }) => v.id)).toEqual([id]);
      const active = await http
        .get(`/v1/vehicles?branchId=${branchId}&active=true`)
        .set(authHeaders(A))
        .expect(StatusCodes.OK);
      expect(active.body.items).toEqual([]);
    });

    it('needs a branch of the same school', async () => {
      const branchOfB = await createBranch(B, 'B fleet');
      await http
        .post('/v1/vehicles')
        .set(authHeaders(A))
        .send({
          branchId: branchOfB,
          plate: 'B-XX 1',
          makeModel: 'Golf',
          transmission: 'automatic',
          licenceClass: 'B',
        })
        .expect(StatusCodes.NOT_FOUND);
      await expectNoEvent(db, {
        type: 'VehicleChanged',
        schoolId: A.schoolId,
        aggregateId: branchOfB,
      });
    });

    it('lets instructors read but not change vehicles', async () => {
      const instructor = authHeadersFor(A, { roles: ['instructor'] });
      const branchId = await createBranch(A);
      await http.get('/v1/vehicles').set(instructor).expect(StatusCodes.OK);
      await http
        .post('/v1/vehicles')
        .set(instructor)
        .send({
          branchId,
          plate: 'B-I 1',
          makeModel: 'Golf',
          transmission: 'manual',
          licenceClass: 'B',
        })
        .expect(StatusCodes.FORBIDDEN);
    });
  });

  describe('staff', () => {
    it('lists staff through the membership directory', async () => {
      const res = await http.get('/v1/staff').set(authHeaders(A)).expect(StatusCodes.OK);
      expect(res.body.items).toEqual([
        expect.objectContaining({
          membershipId: A.ownerMembershipId,
          userId: A.ownerUserId,
          roles: ['owner'],
          status: 'active',
        }),
      ]);
      expect(res.body.nextCursor).toBeNull();
      const instructors = await http.get('/v1/staff?role=instructor').set(authHeaders(A));
      expect(instructors.body.items).toEqual([]);
    });
  });

  describe('payment account', () => {
    it('connects the fake provider, upserts the row and emits PaymentAccountConnected', async () => {
      const first = await http
        .post('/v1/school/payment-account')
        .set(authHeaders(A))
        .send({ provider: 'fake' })
        .expect(StatusCodes.OK);
      expect(first.body).toEqual({
        id: expect.any(String),
        version: 1,
        provider: 'fake',
        status: 'active',
        onboardingUrl: null,
      });
      const event = await expectEventAppended(db, {
        type: PaymentAccountConnected,
        aggregateId: first.body.id,
      });
      expect(event.payload).toMatchObject({ provider: 'fake', status: 'active' });

      const again = await http
        .post('/v1/school/payment-account')
        .set(authHeaders(A))
        .send({ provider: 'fake' })
        .expect(StatusCodes.OK);
      expect(again.body).toMatchObject({ id: first.body.id, version: 2 });

      const account = await executeAs(kernel.app, A, new GetPaymentAccountQuery());
      expect(account).toEqual({
        id: first.body.id,
        provider: 'fake',
        accountRef: event.payload.accountRef,
        status: 'active',
      });
      const school = await http.get('/v1/school').set(authHeaders(A)).expect(StatusCodes.OK);
      expect(school.body.paymentAccount).toEqual({
        id: first.body.id,
        provider: 'fake',
        status: 'active',
      });
      expect(await executeAs(kernel.app, B, new GetPaymentAccountQuery())).toBeNull();
    });

    it('rejects an unknown provider', async () => {
      const res = await http
        .post('/v1/school/payment-account')
        .set(authHeaders(B))
        .send({ provider: 'stripe' })
        .expect(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe('validation_error');
    });
  });
});
