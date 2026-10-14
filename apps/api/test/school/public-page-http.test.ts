import { StatusCodes } from 'http-status-codes';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../../src/kernel/db/columns.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { plans, subscriptions } from '../../src/modules/platform/infra/schema.js';
import { GetPublicProfileQuery, ResolvePublicSchoolQuery } from '../../src/modules/school/index.js';
import { schoolReviews } from '../../src/modules/school/infra/schema.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createStudent, createUser } from '../identity/support.js';
import { executeAs } from '../support/handlers.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  authHeadersFor,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';

describe('school public profile and public page', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;
  let http: ReturnType<typeof request>;
  let planId: string;
  let branchId: string;
  let priceItemId: string;
  let instructor: { userId: string; membershipId: string };

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    kernel = await createKernelTestApp(db);
    tenants = await createTestTenants(db, { context: kernel.app.get(TenantContext) });
    ({ A, B } = tenants);
    http = request(kernel.app.getHttpServer());

    planId = newId();
    await tenants.asSystem((tx) =>
      tx.insert(plans).values({
        id: planId,
        code: 'with-page',
        name: 'With page',
        baseAmountMinor: 4900,
        studentFeeMinor: 300,
        currency: 'EUR',
        active: true,
        features: ['enrolment_page'],
      }),
    );
    await tenants.asSchool(A, (tx) =>
      tx.insert(subscriptions).values({
        id: newId(),
        schoolId: A.schoolId,
        planId,
        startedAt: new Date('2026-01-01T00:00:00Z'),
        endedAt: null,
      }),
    );

    const owner = authHeaders(A);
    const branch = await http
      .post('/v1/branches')
      .set(owner)
      .send({ name: 'Mitte', address: 'Torstr. 1, Berlin', lat: 52.53, lng: 13.4 });
    expect(branch.status).toBe(StatusCodes.CREATED);
    branchId = branch.body.id as string;
    const hours = await http
      .put('/v1/school/opening-hours')
      .set(owner)
      .send({
        items: [
          { branchId, weekday: 2, opens: '09:00', closes: '18:00' },
          { branchId, weekday: 1, opens: '08:00', closes: '12:00' },
        ],
      });
    expect(hours.status).toBe(StatusCodes.OK);

    const shown = await http.post('/v1/price-items').set(owner).send({
      name: '10 lessons',
      kind: 'package',
      creditMinutes: 600,
      amountMinor: 60000,
      currency: 'EUR',
      taxRateBp: 1900,
      showOnPublicPage: true,
    });
    expect(shown.status).toBe(StatusCodes.CREATED);
    priceItemId = shown.body.id as string;
    const hidden = await http.post('/v1/price-items').set(owner).send({
      name: 'Internal fee',
      kind: 'fee',
      amountMinor: 1000,
      currency: 'EUR',
      taxRateBp: 1900,
    });
    expect(hidden.status).toBe(StatusCodes.CREATED);

    for (const [licenceClass, active] of [
      ['B', true],
      ['A', true],
      ['B', true],
      ['C', false],
    ] as const) {
      const type = await http
        .post('/v1/lesson-types')
        .set(owner)
        .send({
          name: `Lesson ${licenceClass}`,
          kind: 'lesson',
          licenceClass,
          minutes: 45,
          creditMinutes: 45,
          requiresVehicle: true,
          requiresEntitlement: null,
          active,
        });
      expect(type.status).toBe(StatusCodes.CREATED);
    }

    const user = await createUser(tenants, { memberships: [{ tenant: A, roles: ['instructor'] }] });
    instructor = { userId: user.userId, membershipId: user.membershipIds[0] as string };
    await system.query(`update users set full_name = 'Ingo Instructor' where id = $1`, [
      user.userId,
    ]);
    await createUser(tenants, {
      memberships: [{ tenant: A, roles: ['instructor'], status: 'disabled' }],
    });
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  describe('GET/PUT /v1/school/public-profile', () => {
    it('returns 404 before the school has a profile', async () => {
      const res = await http.get('/v1/school/public-profile').set(authHeaders(A));
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
      expect(res.body.error.code).toBe('not_found');
    });

    it('rejects a first save without a slug', async () => {
      const res = await http
        .put('/v1/school/public-profile')
        .set(authHeaders(A))
        .send({ headline: 'No slug yet' });
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.details.issues).toEqual([
        { path: ['slug'], message: expect.any(String) },
      ]);
    });

    it.each(['admin', 'Bad_Slug', '-abc'])('rejects the slug %s with 400', async (slug) => {
      const res = await http.put('/v1/school/public-profile').set(authHeaders(A)).send({ slug });
      expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      expect(res.body.error.code).toBe('validation_error');
    });

    it('saves the profile and GET returns it with defaults', async () => {
      const put = await http.put('/v1/school/public-profile').set(authHeaders(A)).send({
        slug: 'school-a',
        headline: 'Learn with us',
        whatsappNumber: '+355691234567',
        published: true,
      });
      expect(put.status).toBe(StatusCodes.OK);
      expect(put.body).toEqual({ id: A.schoolId, version: 1 });

      const get = await http.get('/v1/school/public-profile').set(authHeaders(A));
      expect(get.status).toBe(StatusCodes.OK);
      expect(get.body).toEqual({
        slug: 'school-a',
        published: true,
        headline: 'Learn with us',
        description: null,
        phone: null,
        whatsappNumber: '+355691234567',
        instagramUrl: null,
        facebookUrl: null,
        externalReviewUrl: null,
        showPrices: true,
        showInstructors: true,
        version: 1,
      });
    });

    it('patches only the given fields and bumps the version', async () => {
      const put = await http
        .put('/v1/school/public-profile')
        .set(authHeaders(A))
        .send({ description: 'Since 1999', externalReviewUrl: 'https://maps.example.com/r/1' });
      expect(put.status).toBe(StatusCodes.OK);
      expect(put.body).toEqual({ id: A.schoolId, version: 2 });
      const get = await http.get('/v1/school/public-profile').set(authHeaders(A));
      expect(get.body).toMatchObject({
        slug: 'school-a',
        headline: 'Learn with us',
        description: 'Since 1999',
        externalReviewUrl: 'https://maps.example.com/r/1',
        version: 2,
      });
    });

    it('rejects a slug another school uses with 409 slug_taken', async () => {
      const res = await http
        .put('/v1/school/public-profile')
        .set(authHeaders(B))
        .send({ slug: 'school-a' });
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error.code).toBe('slug_taken');
    });

    it('rejects publishing without the enrolment_page feature with 403 feature_not_in_plan', async () => {
      const res = await http
        .put('/v1/school/public-profile')
        .set(authHeaders(B))
        .send({ slug: 'school-b', published: true });
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
      expect(res.body.error.code).toBe('feature_not_in_plan');

      const draft = await http
        .put('/v1/school/public-profile')
        .set(authHeaders(B))
        .send({ slug: 'school-b' });
      expect(draft.status).toBe(StatusCodes.OK);
      const get = await http.get('/v1/school/public-profile').set(authHeaders(B));
      expect(get.body).toMatchObject({ slug: 'school-b', published: false });
    });

    it('rejects plain http links and malformed phone numbers', async () => {
      for (const body of [
        { instagramUrl: 'http://instagram.com/a' },
        { whatsappNumber: '0691234567' },
      ]) {
        const res = await http.put('/v1/school/public-profile').set(authHeaders(A)).send(body);
        expect(res.status).toBe(StatusCodes.BAD_REQUEST);
      }
    });

    it('is owner-only: office staff get 403', async () => {
      const office = authHeadersFor(A, { roles: ['office'] });
      expect((await http.get('/v1/school/public-profile').set(office)).status).toBe(
        StatusCodes.FORBIDDEN,
      );
    });

    it('GetPublicProfileQuery returns the profile, or null without one', async () => {
      expect(await executeAs(kernel.app, A, new GetPublicProfileQuery())).toMatchObject({
        slug: 'school-a',
      });
      const C = { schoolId: newId(), userId: null };
      expect(await executeAs(kernel.app, C, new GetPublicProfileQuery())).toBeNull();
    });
  });

  describe('GET /v1/public/schools/:slug', () => {
    it('returns the page without auth and caches it for 60 s', async () => {
      const res = await http.get('/v1/public/schools/school-a');
      expect(res.status).toBe(StatusCodes.OK);
      expect(res.headers['cache-control']).toBe('public, max-age=60');
      expect(res.body).toEqual({
        slug: 'school-a',
        name: 'School A',
        headline: 'Learn with us',
        description: 'Since 1999',
        address: '1 A Street',
        phone: null,
        whatsappUrl: 'https://wa.me/355691234567',
        instagramUrl: null,
        facebookUrl: null,
        externalReviewUrl: 'https://maps.example.com/r/1',
        timeZone: 'Europe/Berlin',
        currency: 'EUR',
        locale: 'en',
        branches: [
          {
            id: branchId,
            name: 'Mitte',
            address: 'Torstr. 1, Berlin',
            lat: 52.53,
            lng: 13.4,
            openingHours: [
              { weekday: 1, opens: '08:00', closes: '12:00' },
              { weekday: 2, opens: '09:00', closes: '18:00' },
            ],
          },
        ],
        prices: [
          {
            id: priceItemId,
            name: '10 lessons',
            kind: 'package',
            amountMinor: 60000,
            currency: 'EUR',
            creditMinutes: 600,
          },
        ],
        instructors: [{ membershipId: instructor.membershipId, name: 'Ingo Instructor' }],
        reviews: { count: 0, averageRatingTenths: 0, items: [] },
        licenceClasses: ['A', 'B'],
        consentTextVersion: 'lead-consent.v1',
      });
    });

    it('returns 404 school_not_found for an unknown or unpublished slug', async () => {
      for (const slug of ['no-such-school', 'school-b']) {
        const res = await http.get(`/v1/public/schools/${slug}`);
        expect(res.status).toBe(StatusCodes.NOT_FOUND);
        expect(res.body.error.code).toBe('school_not_found');
      }
    });

    it('returns 404 when the school lost the plan feature', async () => {
      await system.query(`update plans set features = '{}' where id = $1`, [planId]);
      try {
        const res = await http.get('/v1/public/schools/school-a');
        expect(res.status).toBe(StatusCodes.NOT_FOUND);
        expect(res.body.error.code).toBe('school_not_found');
      } finally {
        await system.query(`update plans set features = '{enrolment_page}' where id = $1`, [
          planId,
        ]);
      }
    });

    it('hides prices and instructors when the profile says so', async () => {
      const put = await http
        .put('/v1/school/public-profile')
        .set(authHeaders(A))
        .send({ showPrices: false, showInstructors: false });
      expect(put.status).toBe(StatusCodes.OK);
      try {
        const res = await http.get('/v1/public/schools/school-a');
        expect(res.body).toMatchObject({ prices: [], instructors: [] });
      } finally {
        await http
          .put('/v1/school/public-profile')
          .set(authHeaders(A))
          .send({ showPrices: true, showInstructors: true });
      }
    });

    it('lists the sorted distinct licence classes of active lesson types, else B', async () => {
      const page = async () =>
        (await http.get('/v1/public/schools/school-a')).body.licenceClasses as string[];
      expect(await page()).toEqual(['A', 'B']);
      const deactivated = await system.query<{ id: string }>(
        `update lesson_types set active = false where school_id = $1 and active returning id`,
        [A.schoolId],
      );
      try {
        expect(await page()).toEqual(['B']);
      } finally {
        await system.query(`update lesson_types set active = true where id = any($1)`, [
          deactivated.rows.map((row) => row.id),
        ]);
      }
    });

    it('shows only approved reviews, newest first, and the average', async () => {
      const review = async (
        status: 'pending' | 'approved' | 'hidden',
        rating: number,
        at: string,
      ) => {
        const studentId = await createStudent(tenants, A, { dateOfBirth: '2000-01-01' });
        const id = newId();
        await tenants.asSchool(A, (tx) =>
          tx.insert(schoolReviews).values({
            id,
            schoolId: A.schoolId,
            studentId,
            rating,
            text: `${status} ${rating}`,
            displayName: 'Stella S.',
            status,
            submittedAt: new Date(at),
          }),
        );
        return id;
      };
      const older = await review('approved', 5, '2026-09-01T10:00:00Z');
      const newer = await review('approved', 4, '2026-09-02T10:00:00Z');
      await review('pending', 1, '2026-09-03T10:00:00Z');
      await review('hidden', 1, '2026-09-04T10:00:00Z');

      const res = await http.get('/v1/public/schools/school-a');
      expect(res.body.reviews).toEqual({
        count: 2,
        averageRatingTenths: 45,
        items: [
          {
            id: newer,
            displayName: 'Stella S.',
            rating: 4,
            text: 'approved 4',
            submittedAt: '2026-09-02T10:00:00.000Z',
          },
          {
            id: older,
            displayName: 'Stella S.',
            rating: 5,
            text: 'approved 5',
            submittedAt: '2026-09-01T10:00:00.000Z',
          },
        ],
      });
    });

    it('ResolvePublicSchoolQuery resolves the school in a school-less scope, 404 otherwise', async () => {
      const none = { schoolId: null, userId: null };
      expect(await executeAs(kernel.app, none, new ResolvePublicSchoolQuery('school-a'))).toBe(
        A.schoolId,
      );
      await expect(
        executeAs(kernel.app, none, new ResolvePublicSchoolQuery('school-b')),
      ).rejects.toMatchObject({ status: StatusCodes.NOT_FOUND, code: 'school_not_found' });
    });
  });
});
