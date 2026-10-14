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
  school_public_profiles: 1,
  school_reviews: 1,
  test_attempts: 1,
  rm_test_attempts_daily: 1,
  leads: 2,
  rm_lead_students: 1,
  rm_school_metrics_daily: 2,
  growth_reports: 1,
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

  it('flags the single lesson and the 10-lesson package of Berlin for the public page', async () => {
    const result = await system.query(
      `select school_id, name from price_items where show_on_public_page order by school_id, sort_order`,
    );
    expect(result.rows).toEqual([
      { school_id: berlin, name: 'Single lesson' },
      { school_id: berlin, name: '10-lesson package' },
    ]);
  });

  it('publishes the Fahrschule Spree page at fahrschule-spree and nothing for Lisbon', async () => {
    const profiles = await system.query(
      `select school_id, slug, published, headline is not null as has_headline,
              description is not null as has_description, phone, whatsapp_number, instagram_url,
              facebook_url, external_review_url, show_prices, show_instructors
         from school_public_profiles`,
    );
    expect(profiles.rows).toEqual([
      {
        school_id: berlin,
        slug: 'fahrschule-spree',
        published: true,
        has_headline: true,
        has_description: true,
        phone: '+4915550000002',
        whatsapp_number: '+4915550000002',
        instagram_url: 'https://instagram.com/fahrschule.spree',
        facebook_url: null,
        external_review_url: 'https://maps.google.com/?cid=example',
        show_prices: true,
        show_instructors: true,
      },
    ]);
    const app = await connect(db.appUrl);
    try {
      const resolved = await app.query<{ id: string | null }>(
        `select school_id_for_public_slug('fahrschule-spree') as id`,
      );
      expect(resolved.rows).toEqual([{ id: berlin }]);
    } finally {
      await app.end();
    }
  });

  it('shows one approved review by Sam, who passed the practical test', async () => {
    const reviews = await system.query(
      `select r.school_id, r.student_id, r.rating, r.text is not null as has_text, r.display_name,
              r.status, r.moderated_by_user_id, r.moderated_at >= r.submitted_at as moderated_after
         from school_reviews r`,
    );
    expect(reviews.rows).toEqual([
      {
        school_id: berlin,
        student_id: SEED.students.sam.id,
        rating: 5,
        has_text: true,
        display_name: 'Sam S.',
        status: 'approved',
        moderated_by_user_id: SEED.users.berlinOwner.id,
        moderated_after: true,
      },
    ]);
    const attempts = await system.query(
      `select a.school_id, a.student_id, a.kind, a.result, d.attempts, d.passed
         from test_attempts a
         join rm_test_attempts_daily d
           on d.school_id = a.school_id and d.day = a.taken_on and d.kind = a.kind::text`,
    );
    expect(attempts.rows).toEqual([
      {
        school_id: berlin,
        student_id: SEED.students.sam.id,
        kind: 'practical',
        result: 'passed',
        attempts: 1,
        passed: 1,
      },
    ]);
  });

  it('has a new page lead and a converted manual lead linked to Sofia', async () => {
    const leads = await system.query(
      `select school_id, status, source, full_name, phone, email, licence_class,
              message is not null as has_message, jsonb_array_length(enquiries) as enquiries,
              is_minor, consent_text_version, student_id, converted_at is not null as converted
         from leads order by full_name`,
    );
    expect(leads.rows).toEqual([
      {
        school_id: berlin,
        status: 'new',
        source: 'page',
        full_name: 'Lea Lead',
        phone: '+4915550000020',
        email: 'lea.lead@example.com',
        licence_class: 'B',
        has_message: true,
        enquiries: 1,
        is_minor: false,
        consent_text_version: 'lead-consent.v1',
        student_id: null,
        converted: false,
      },
      {
        school_id: berlin,
        status: 'converted',
        source: 'manual',
        full_name: 'Sofia Silva',
        phone: '+4915550000008',
        email: 'sofia.silva@example.com',
        licence_class: 'B',
        has_message: false,
        enquiries: 1,
        is_minor: false,
        consent_text_version: 'manual',
        student_id: SEED.students.sofia.id,
        converted: true,
      },
    ]);
    const attributed = await system.query(
      `select r.school_id, r.student_id, l.full_name
         from rm_lead_students r join leads l on l.id = r.lead_id`,
    );
    expect(attributed.rows).toEqual([
      { school_id: berlin, student_id: SEED.students.sofia.id, full_name: 'Sofia Silva' },
    ]);
  });

  it('counts the two leads in September 2026 so the growth funnel is not empty', async () => {
    const daily = await system.query(
      `select school_id, sum(leads_captured)::int as captured, sum(leads_converted)::int as converted,
              sum(lead_revenue_minor)::int as revenue
         from rm_school_metrics_daily where day between '2026-09-01' and '2026-09-30'
        group by school_id`,
    );
    expect(daily.rows).toEqual([{ school_id: berlin, captured: 2, converted: 1, revenue: 0 }]);
    const report = await system.query(
      `select school_id, month::text, currency, leads_captured, leads_converted,
              lead_revenue_minor::int as lead_revenue
         from growth_reports`,
    );
    expect(report.rows).toEqual([
      {
        school_id: berlin,
        month: '2026-09-01',
        currency: 'EUR',
        leads_captured: 2,
        leads_converted: 1,
        lead_revenue: 0,
      },
    ]);
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
