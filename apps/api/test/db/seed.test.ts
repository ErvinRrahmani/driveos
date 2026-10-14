import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED } from '../../scripts/db/seed-data.js';
import { type SeedResult, seedDatabase } from '../../scripts/db/seeder.js';
import { DatabaseService } from '../../src/kernel/db/database.service.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { connect, createScratchDatabase, type ScratchDatabase } from './scratch-database.js';
import { ALL_TABLES } from './spec-tables.js';

const EXPECTED_COUNTS: Record<string, number> = {
  users: 11,
  platform_admins: 1,
  memberships: 10,
  schools: 2,
  school_settings: 2,
  opening_hours: 12,
  branches: 2,
  vehicles: 3,
  plans: 2,
  subscriptions: 2,
  lesson_types: 6,
  availability: 10,
  availability_versions: 2,
  students: 5,
  enrolments: 5,
  student_instructors: 5,
  guardian_links: 1,
  syllabus_items: 16,
  rm_student_list: 5,
  price_items: 8,
  question_packs: 1,
  questions: 12,
  conversations: 10,
  messages: 4,
};

const TODAY = new Date('2026-10-08T10:00:00Z');

async function countAll(client: pg.Client): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of ALL_TABLES) {
    const result = await client.query<{ n: number }>(`select count(*)::int as n from ${table}`);
    counts[table] = result.rows[0]?.n ?? -1;
  }
  return counts;
}

describe('db:seed', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let database: DatabaseService;
  let tenant: TenantContext;
  let first: SeedResult;
  let countsAfterFirst: Record<string, number>;

  const berlin = SEED.schools.berlin.id;
  const lisbon = SEED.schools.lisbon.id;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    database = new DatabaseService({ DATABASE_URL: db.appUrl, DATABASE_SYSTEM_URL: db.systemUrl });
    tenant = new TenantContext(database);
    first = await seedDatabase(tenant, { today: TODAY });
    countsAfterFirst = await countAll(system);
  }, 60_000);

  afterAll(async () => {
    await database?.close();
    await system?.end();
    await db?.drop();
  });

  it('creates exactly the listed rows and nothing else', () => {
    const expected = Object.fromEntries(ALL_TABLES.map((t) => [t, EXPECTED_COUNTS[t] ?? 0]));
    expect(countsAfterFirst).toEqual(expected);
  });

  it('is idempotent: a second run leaves the same counts', async () => {
    await seedDatabase(tenant, { today: new Date('2027-03-01T10:00:00Z') });
    expect(await countAll(system)).toEqual(countsAfterFirst);
  });

  it('creates two active EUR schools in different time zones with settings and a branch each', async () => {
    const schools = await system.query(
      `select s.id, s.time_zone, s.currency, s.locale, s.status, ss.age_of_majority,
              (select count(*)::int from branches b where b.school_id = s.id) as branches
         from schools s join school_settings ss on ss.school_id = s.id order by s.time_zone`,
    );
    expect(schools.rows).toEqual([
      {
        id: berlin,
        time_zone: 'Europe/Berlin',
        currency: 'EUR',
        locale: 'en',
        status: 'active',
        age_of_majority: 18,
        branches: 1,
      },
      {
        id: lisbon,
        time_zone: 'Europe/Lisbon',
        currency: 'EUR',
        locale: 'en',
        status: 'active',
        age_of_majority: 18,
        branches: 1,
      },
    ]);
  });

  it('opens Mon-Fri 08:00-20:00 and Sat 09:00-14:00 in each school', async () => {
    for (const schoolId of [berlin, lisbon]) {
      const hours = await system.query(
        `select weekday, opens::text, closes::text, branch_id from opening_hours
          where school_id = $1 order by weekday`,
        [schoolId],
      );
      expect(hours.rows).toEqual([
        ...[1, 2, 3, 4, 5].map((weekday) => ({
          weekday,
          opens: '08:00:00',
          closes: '20:00:00',
          branch_id: null,
        })),
        { weekday: 6, opens: '09:00:00', closes: '14:00:00', branch_id: null },
      ]);
    }
  });

  it('subscribes Berlin to standard and Lisbon to solo', async () => {
    const result = await system.query(
      `select s.school_id, p.code, p.base_amount_minor::int as base, p.student_fee_minor::int as fee, p.currency
         from subscriptions s join plans p on p.id = s.plan_id order by p.code`,
    );
    expect(result.rows).toEqual([
      { school_id: lisbon, code: 'solo', base: 0, fee: 300, currency: 'EUR' },
      { school_id: berlin, code: 'standard', base: 4900, fee: 300, currency: 'EUR' },
    ]);
  });

  it('gives Berlin an owner, office user and instructor, and Lisbon one owner+instructor membership', async () => {
    const result = await system.query(
      `select school_id, roles, status from memberships
        where not roles && array['student', 'parent'] order by school_id, roles`,
    );
    expect(result.rows).toEqual([
      { school_id: berlin, roles: ['instructor'], status: 'active' },
      { school_id: berlin, roles: ['office'], status: 'active' },
      { school_id: berlin, roles: ['owner'], status: 'active' },
      { school_id: lisbon, roles: ['owner', 'instructor'], status: 'active' },
    ]);
  });

  it('has two vehicles in Berlin and one in Lisbon', async () => {
    const result = await system.query(
      `select school_id, count(*)::int as n from vehicles where active group by school_id order by n desc`,
    );
    expect(result.rows).toEqual([
      { school_id: berlin, n: 2 },
      { school_id: lisbon, n: 1 },
    ]);
  });

  it('creates standard, night and exam lesson types per school', async () => {
    for (const schoolId of [berlin, lisbon]) {
      const result = await system.query(
        `select kind, minutes, credit_minutes, requires_vehicle, requires_entitlement, licence_class, active
           from lesson_types where school_id = $1 order by kind, minutes desc`,
        [schoolId],
      );
      expect(result.rows).toEqual([
        {
          kind: 'lesson',
          minutes: 60,
          credit_minutes: 60,
          requires_vehicle: true,
          requires_entitlement: null,
          licence_class: 'B',
          active: true,
        },
        {
          kind: 'lesson',
          minutes: 45,
          credit_minutes: 60,
          requires_vehicle: true,
          requires_entitlement: null,
          licence_class: 'B',
          active: true,
        },
        {
          kind: 'exam',
          minutes: 60,
          credit_minutes: 0,
          requires_vehicle: true,
          requires_entitlement: 'exam_car',
          licence_class: 'B',
          active: true,
        },
      ]);
    }
  });

  it('creates five Berlin students, one of them a 16-year-old minor with a guardian', async () => {
    const students = await system.query(
      `select s.id, s.status, extract(year from age($2::date, s.date_of_birth))::int as age,
              s.full_name <> '' and s.full_name = u.full_name as named, m.roles, m.status as membership_status,
              (select count(*)::int from enrolments e where e.student_id = s.id) as enrolments,
              (select count(*)::int from student_instructors si
                 where si.student_id = s.id and si.is_primary and si.unassigned_at is null
                   and si.instructor_membership_id = $3) as primary_instructors
         from students s join memberships m on m.user_id = s.user_id and m.school_id = s.school_id
         join users u on u.id = s.user_id
        where s.school_id = $1 order by age`,
      [berlin, TODAY.toISOString().slice(0, 10), SEED.memberships.berlinInstructor],
    );
    expect(students.rows).toHaveLength(5);
    const [minor, ...adults] = students.rows;
    expect(minor).toMatchObject({
      id: SEED.students.minor.id,
      age: 16,
      roles: ['student'],
      membership_status: 'pending_consent',
    });
    for (const adult of adults) {
      expect(adult.age).toBeGreaterThanOrEqual(18);
      expect(adult).toMatchObject({ roles: ['student'], membership_status: 'active' });
    }
    for (const student of students.rows) {
      expect(student).toMatchObject({
        status: 'active',
        named: true,
        enrolments: 1,
        primary_instructors: 1,
      });
    }
    const guardian = await system.query(
      `select g.student_id, g.consent_at, m.roles, m.status
         from guardian_links g join memberships m on m.user_id = g.guardian_user_id and m.school_id = g.school_id`,
    );
    expect(guardian.rows).toEqual([
      { student_id: SEED.students.minor.id, consent_at: null, roles: ['parent'], status: 'active' },
    ]);
  });

  it('creates class B syllabus items in each school', async () => {
    const result = await system.query(
      `select school_id, count(*)::int as n, count(distinct code)::int as codes
         from syllabus_items where licence_class = 'B' group by school_id order by school_id`,
    );
    expect(result.rows).toEqual([
      { school_id: berlin, n: 8, codes: 8 },
      { school_id: lisbon, n: 8, codes: 8 },
    ]);
  });

  it('fills rm_student_list for the seeded students so the student list is not empty', async () => {
    const result = await system.query(
      `select r.full_name, r.licence_class, r.status, r.primary_instructor_name, r.balance_minutes,
              r.progress_pct, r.school_id = s.school_id as same_school
         from rm_student_list r join students s on s.id = r.student_id order by r.full_name`,
    );
    expect(result.rows).toHaveLength(5);
    for (const row of result.rows) {
      expect(row).toMatchObject({
        licence_class: 'B',
        primary_instructor_name: 'Ingo Instructor',
        balance_minutes: 0,
        progress_pct: 0,
        same_school: true,
      });
    }
    expect(result.rows.map((row) => row.full_name)).toContain('Stella Student');
  });

  it('creates the four price items per school with amount, currency and tax rate', async () => {
    for (const schoolId of [berlin, lisbon]) {
      const result = await system.query(
        `select kind, credit_minutes, entitlement_kind, amount_minor::int as amount, currency, tax_rate_bp, active
           from price_items where school_id = $1 order by sort_order`,
        [schoolId],
      );
      expect(result.rows.map(({ amount: _a, tax_rate_bp: _t, ...rest }) => rest)).toEqual([
        {
          kind: 'lesson',
          credit_minutes: 60,
          entitlement_kind: null,
          currency: 'EUR',
          active: true,
        },
        {
          kind: 'package',
          credit_minutes: 600,
          entitlement_kind: null,
          currency: 'EUR',
          active: true,
        },
        {
          kind: 'upsell',
          credit_minutes: null,
          entitlement_kind: 'premium_theory',
          currency: 'EUR',
          active: true,
        },
        {
          kind: 'upsell',
          credit_minutes: null,
          entitlement_kind: 'exam_car',
          currency: 'EUR',
          active: true,
        },
      ]);
      for (const row of result.rows) {
        expect(row.amount).toBeGreaterThan(0);
        expect(row.tax_rate_bp).toBeGreaterThan(0);
      }
    }
  });

  it('publishes the SAMPLE question pack with its questions', async () => {
    const pack = await system.query(
      `select country_code, licence_class, language, version, status, published_at is not null as published,
              exam_rules from question_packs`,
    );
    expect(pack.rows).toEqual([
      {
        country_code: 'XX',
        licence_class: 'B',
        language: 'en',
        version: 202601,
        status: 'published',
        published: true,
        exam_rules: {
          rules: 'fraction',
          questions: 10,
          timeLimitMinutes: 15,
          passMark: 0.8,
          categories: { signs: 3, rules: 5, safety: 2 },
        },
      },
    ]);
    const questions = await system.query(
      `select category, count(*)::int as n, bool_and(body #>> '{}' like 'SAMPLE:%') as sample
         from questions group by category order by category`,
    );
    expect(questions.rows).toEqual([
      { category: 'rules', n: 5, sample: true },
      { category: 'safety', n: 3, sample: true },
      { category: 'signs', n: 4, sample: true },
    ]);
  });

  it('seeds a platform admin', async () => {
    const result = await system.query('select user_id from platform_admins');
    expect(result.rows).toEqual([{ user_id: SEED.users.platformAdmin.id }]);
  });

  it('returns a login for every seeded user', async () => {
    const users = await system.query<{ id: string }>('select id from users order by id');
    expect(first.logins.map((login) => login.userId).sort()).toEqual(users.rows.map((u) => u.id));
    const owner = first.logins.find((login) => login.userId === SEED.users.lisbonOwner.id);
    expect(owner).toMatchObject({
      schoolId: lisbon,
      membershipId: SEED.memberships.lisbonOwner,
      roles: ['owner', 'instructor'],
    });
  });
});
