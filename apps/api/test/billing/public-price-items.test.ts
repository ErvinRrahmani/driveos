import { StatusCodes } from 'http-status-codes';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { ListPublicPriceItemsQuery } from '../../src/modules/billing/index.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { executeAs } from '../support/handlers.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';

describe('billing: public price items (ListPublicPriceItemsQuery)', () => {
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

  const lesson = {
    name: 'Single lesson',
    kind: 'lesson',
    creditMinutes: 60,
    amountMinor: 6500,
    currency: 'EUR',
    taxRateBp: 1900,
    sortOrder: 2,
  };

  async function create(body: Record<string, unknown>, as: TestTenant = A): Promise<string> {
    const res = await http.post('/v1/price-items').set(authHeaders(as)).send(body);
    expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.CREATED);
    return res.body.id as string;
  }

  it('lists only active items shown on the public page, ordered by sort order then name', async () => {
    const second = await create({ ...lesson, name: 'B lesson', showOnPublicPage: true });
    const first = await create({
      ...lesson,
      name: 'Package',
      kind: 'package',
      creditMinutes: 600,
      amountMinor: 60_000,
      sortOrder: 1,
      showOnPublicPage: true,
    });
    const third = await create({ ...lesson, name: 'A lesson', showOnPublicPage: true });
    await create({ ...lesson, name: 'Inactive', showOnPublicPage: true, active: false });
    await create({ ...lesson, name: 'Private' });
    await create({ ...lesson, name: 'Other school', showOnPublicPage: true }, B);

    const items = await executeAs(kernel.app, A, new ListPublicPriceItemsQuery());
    expect(items).toEqual([
      {
        id: first,
        name: 'Package',
        kind: 'package',
        amountMinor: 60_000,
        currency: 'EUR',
        creditMinutes: 600,
      },
      {
        id: third,
        name: 'A lesson',
        kind: 'lesson',
        amountMinor: 6500,
        currency: 'EUR',
        creditMinutes: 60,
      },
      {
        id: second,
        name: 'B lesson',
        kind: 'lesson',
        amountMinor: 6500,
        currency: 'EUR',
        creditMinutes: 60,
      },
    ]);
    expect(await executeAs(kernel.app, B, new ListPublicPriceItemsQuery())).toHaveLength(1);
  });

  it('defaults showOnPublicPage to false and PATCH can flip it', async () => {
    const id = await create({ ...lesson, name: 'Flip me', sortOrder: 50 });
    const listed = async () =>
      (await executeAs(kernel.app, A, new ListPublicPriceItemsQuery())).map((item) => item.id);
    expect(await listed()).not.toContain(id);

    const row = async () =>
      (
        await http.get('/v1/price-items').set(authHeaders(A)).expect(StatusCodes.OK)
      ).body.items.find((item: { id: string }) => item.id === id);
    expect(await row()).toMatchObject({ showOnPublicPage: false });

    await http
      .patch(`/v1/price-items/${id}`)
      .set(authHeaders(A))
      .send({ showOnPublicPage: true })
      .expect(StatusCodes.OK);
    expect(await listed()).toContain(id);
    expect(await row()).toMatchObject({ showOnPublicPage: true });

    await http
      .patch(`/v1/price-items/${id}`)
      .set(authHeaders(A))
      .send({ showOnPublicPage: false })
      .expect(StatusCodes.OK);
    expect(await listed()).not.toContain(id);
  });
});
