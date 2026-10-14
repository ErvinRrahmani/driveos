import { randomUUID } from 'node:crypto';
import { Body, Controller, Module, Post } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { mapExclusion } from '../../src/kernel/http/errors.js';
import { parseBody, ZodValidationPipe } from '../../src/kernel/http/validation.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { createSchoolFixture, type SchoolFixture } from '../db/fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createKernelTestApp, devAuth, type KernelTestApp } from '../support/kernel-app.js';
import { StatusCodes } from 'http-status-codes';

const lessonBody = z.object({
  instructorId: z.uuid(),
  studentId: z.uuid(),
  vehicleId: z.uuid(),
  lessonTypeId: z.uuid(),
  start: z.iso.datetime(),
});

type LessonBody = z.infer<typeof lessonBody>;

const nameBody = z.object({ name: z.string().min(1) }).strict();

@Controller('probe')
class ProbeController {
  constructor(private readonly tenant: TenantContext) {}

  private async insertLesson(body: LessonBody): Promise<string> {
    const id = randomUUID();
    const start = new Date(body.start);
    const end = new Date(start.getTime() + 60 * 60_000);
    await this.tenant.tx.execute(sql`insert into lessons (id, school_id, student_id,
      instructor_membership_id, vehicle_id, lesson_type_id, credit_minutes, period, status,
      pickup_address, pickup_lat, pickup_lng, booked_by_membership_id, booked_via, version)
      values (${id}, ${this.tenant.schoolId}, ${body.studentId}, ${body.instructorId},
      ${body.vehicleId}, ${body.lessonTypeId}, 60,
      tstzrange(${start.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz, '[)'),
      'booked', '1 Main St', 51.5, -0.12, ${body.instructorId}, 'office', 1)`);
    return id;
  }

  @Post('lessons')
  async bookLesson(@Body(new ZodValidationPipe(lessonBody)) body: LessonBody) {
    try {
      return { id: await this.insertLesson(body) };
    } catch (err) {
      mapExclusion(err, {
        lessons_instructor_no_overlap: 'lesson_conflict',
        lessons_vehicle_no_overlap: 'vehicle_conflict',
      });
    }
  }

  @Post('lessons/unmapped')
  async bookLessonUnmapped(@Body(new ZodValidationPipe(lessonBody)) body: LessonBody) {
    return { id: await this.insertLesson(body) };
  }

  @Post('branches/duplicate')
  async duplicateBranch() {
    const id = randomUUID();
    for (let i = 0; i < 2; i++) {
      await this.tenant.tx.execute(sql`insert into branches (id, school_id, name, address, lat, lng)
        values (${id}, ${this.tenant.schoolId}, 'Twin', 'x', 0, 0)`);
    }
  }

  @Post('vehicles/missing-branch')
  async vehicleWithMissingBranch() {
    await this.tenant.tx.execute(sql`insert into vehicles (id, school_id, branch_id, plate,
      make_model, transmission, licence_class, active)
      values (${randomUUID()}, ${this.tenant.schoolId}, ${randomUUID()}, 'X-1', 'Car', 'manual',
      'B', true)`);
  }

  @Post('branches/referenced')
  async deleteReferencedBranch(@Body() body: { branchId: string }) {
    await this.tenant.tx.execute(sql`delete from branches where id = ${body.branchId}`);
  }

  @Post('parsed')
  parsed(@Body() body: unknown) {
    return parseBody(nameBody, body);
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('error mapping', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let school: SchoolFixture;
  let kernel: KernelTestApp;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    school = await createSchoolFixture(system);
    kernel = await createKernelTestApp(db, [ProbeModule]);
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  const post = (path: string) =>
    request(kernel.app.getHttpServer())
      .post(`/v1/probe/${path}`)
      .set(devAuth(school.schoolId, school.ownerUserId));

  const lesson = (start: string, overrides: Partial<LessonBody> = {}) => ({
    instructorId: school.instructorIds[0],
    studentId: school.studentIds[0],
    vehicleId: school.vehicleIds[0],
    lessonTypeId: school.lessonTypeId,
    start,
    ...overrides,
  });

  it('maps a mapped exclusion violation (23P01) to 409 with the handler code', async () => {
    await post('lessons').send(lesson('2030-01-07T09:00:00Z')).expect(StatusCodes.CREATED);

    const res = await post('lessons')
      .send(
        lesson('2030-01-07T09:30:00Z', {
          studentId: school.studentIds[1],
          vehicleId: school.vehicleIds[1],
        }),
      )
      .expect(StatusCodes.CONFLICT);
    expect(res.body).toEqual({
      error: { code: 'lesson_conflict', message: 'The request conflicts with existing data.' },
    });
  });

  it('chooses the code by constraint name', async () => {
    await post('lessons').send(lesson('2030-01-08T09:00:00Z')).expect(StatusCodes.CREATED);

    const res = await post('lessons')
      .send(
        lesson('2030-01-08T09:30:00Z', {
          instructorId: school.instructorIds[1],
          studentId: school.studentIds[1],
        }),
      )
      .expect(StatusCodes.CONFLICT);
    expect(res.body.error.code).toBe('vehicle_conflict');
  });

  it('maps an unmapped exclusion violation to 409 conflict', async () => {
    await post('lessons/unmapped').send(lesson('2030-01-09T09:00:00Z')).expect(StatusCodes.CREATED);

    const res = await post('lessons/unmapped')
      .send(lesson('2030-01-09T09:15:00Z', { vehicleId: school.vehicleIds[1] }))
      .expect(StatusCodes.CONFLICT);
    expect(res.body).toEqual({
      error: { code: 'conflict', message: 'The request conflicts with existing data.' },
    });
  });

  it('maps a unique violation (23505) to 409 conflict', async () => {
    const res = await post('branches/duplicate').expect(StatusCodes.CONFLICT);
    expect(res.body.error.code).toBe('conflict');
  });

  it('maps a foreign key violation (23503) to 404 not_found', async () => {
    const res = await post('vehicles/missing-branch').expect(StatusCodes.NOT_FOUND);
    expect(res.body).toEqual({
      error: { code: 'not_found', message: 'The requested resource was not found.' },
    });
  });

  it('maps deleting a still-referenced row (23503) to 409 conflict', async () => {
    const res = await post('branches/referenced')
      .send({ branchId: school.branchId })
      .expect(StatusCodes.CONFLICT);
    expect(res.body.error.code).toBe('conflict');
  });

  it('rejects an invalid body through ZodValidationPipe with 400 validation_error', async () => {
    const res = await post('lessons').send(lesson('not a date')).expect(StatusCodes.BAD_REQUEST);
    expect(res.body.error.code).toBe('validation_error');
    expect(res.body.error.details.issues[0].path).toEqual(['start']);
  });

  it('parseBody returns the parsed body or throws a 400 validation_error', async () => {
    await post('parsed').send({ name: 'Ok' }).expect(StatusCodes.CREATED, { name: 'Ok' });
    const res = await post('parsed').send({ name: 'Ok', extra: 1 }).expect(StatusCodes.BAD_REQUEST);
    expect(res.body.error.code).toBe('validation_error');
  });
});

describe('mapExclusion', () => {
  it('rethrows anything that is not a mapped exclusion violation unchanged', () => {
    const original = new Error('boom');
    expect(() => mapExclusion(original, { some_constraint: 'x' })).toThrow(original);
  });
});
