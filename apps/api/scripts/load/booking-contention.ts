import { randomUUID } from 'node:crypto';
import { studentBalanceResponseSchema } from '@driveos/shared';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import {
  adminClient,
  countBy,
  Invariants,
  LoadFixtures,
  type LoadStudent,
  loadEnv,
  percentile,
  printTable,
  type Timed,
  timedRequest,
} from './lib.js';

const params = z
  .object({
    SAME_SLOT_STUDENTS: z.coerce.number().int().min(2).default(50),
    BALANCE_ATTEMPTS: z.coerce.number().int().min(2).default(30),
    BALANCE_LESSONS: z.coerce.number().int().min(1).default(5),
    MIXED_SLOT_STUDENTS: z.coerce.number().int().min(2).default(25),
    MIXED_ATTEMPTS: z.coerce.number().int().min(2).default(15),
    MIXED_LESSONS: z.coerce.number().int().min(1).default(4),
  })
  .parse(process.env);

const env = loadEnv();
const admin = await adminClient(env);
const fixtures = new LoadFixtures(admin, env.AUTH_JWT_SECRET);
const invariants = new Invariants();
const school = await fixtures.school(new Date().toISOString(), { instructors: 3, vehicles: 3 });
const DAY = 86_400_000;
const firstDay = Math.floor(Date.now() / DAY) * DAY + 14 * DAY;

const slot = (index: number) =>
  new Date(firstDay + Math.floor(index / 12) * DAY + (8 + (index % 12)) * 3_600_000);

const lesson = (student: LoadStudent, pair: number, start: Date): Promise<Timed> =>
  timedRequest(
    env,
    'POST',
    '/v1/lessons',
    student.token,
    {
      studentId: student.studentId,
      instructorMembershipId: school.instructors[pair]?.membershipId,
      vehicleId: school.vehicleIds[pair],
      lessonTypeId: school.lessonTypeId,
      start: start.toISOString(),
    },
    { 'Idempotency-Key': randomUUID() },
  );

const students = async (count: number, credit: number) => {
  const created: LoadStudent[] = [];
  for (let i = 0; i < count; i += 1) created.push(await fixtures.student(school, credit));
  return created;
};

const samplerClient = await adminClient(env);
let minBalance = Number.POSITIVE_INFINITY;
let sampling = true;
const sampler = (async () => {
  while (sampling) {
    const { rows } = await samplerClient.query<{ min: number | null }>(
      `select min(balance)::int as min from (
         select sum(minutes) as balance from ledger_entries where school_id = $1 group by student_id
       ) b`,
      [school.schoolId],
    );
    minBalance = Math.min(minBalance, rows[0]?.min ?? 0);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
})();

const summary: (string | number)[][] = [];
const record = (name: string, results: Timed[]) => {
  const ms = results.map((r) => r.ms);
  summary.push([
    name,
    results.length,
    JSON.stringify(countBy(results)),
    percentile(ms, 50).toFixed(0),
    percentile(ms, 95).toFixed(0),
    Math.max(...ms).toFixed(0),
  ]);
};
const created = (results: Timed[]) => results.filter((r) => r.status === StatusCodes.CREATED);
const failedWith = (results: Timed[], code: string) =>
  results.filter((r) => r.status === StatusCodes.CONFLICT && r.code === code);

const sameSlot = (pair: number, bookers: LoadStudent[], start: Date) =>
  Promise.all(bookers.map((student) => lesson(student, pair, start)));

const limitedBalance = (pair: number, student: LoadStudent, attempts: number, offset: number) =>
  Promise.all(Array.from({ length: attempts }, (_, i) => lesson(student, pair, slot(offset + i))));

async function limitedStudent(lessons: number): Promise<LoadStudent> {
  const [student] = await students(1, lessons * school.lessonMinutes);
  if (!student) throw new Error('No student created');
  return student;
}

async function balanceOf(student: LoadStudent) {
  const res = await timedRequest(
    env,
    'GET',
    `/v1/students/${student.studentId}/balance`,
    student.token,
  );
  const parsed = studentBalanceResponseSchema.safeParse(res.body);
  return parsed.success ? parsed.data.balanceMinutes : Number.NaN;
}

async function checkBalance(name: string, student: LoadStudent, expected: number) {
  const api = await balanceOf(student);
  const { rows } = await admin.query<{ sum: number }>(
    'select coalesce(sum(minutes), 0)::int as sum from ledger_entries where student_id = $1',
    [student.studentId],
  );
  invariants.check(api === expected, `${name}: API balance ${api}, expected ${expected}`);
  invariants.check(
    rows[0]?.sum === expected,
    `${name}: ledger sum ${rows[0]?.sum}, expected ${expected}`,
  );
}

function checkSameSlot(name: string, results: Timed[]) {
  invariants.check(
    created(results).length === 1,
    `${name}: ${created(results).length} created, expected 1`,
  );
  invariants.check(
    failedWith(results, 'lesson_conflict').length === results.length - 1,
    `${name}: ${JSON.stringify(countBy(results))}, expected the rest 409 lesson_conflict`,
  );
}

function checkLimited(name: string, results: Timed[], lessons: number) {
  invariants.check(
    created(results).length === lessons,
    `${name}: ${created(results).length} created, expected ${lessons}`,
  );
  invariants.check(
    failedWith(results, 'insufficient_balance').length === results.length - lessons,
    `${name}: ${JSON.stringify(countBy(results))}, expected the rest 409 insufficient_balance`,
  );
}

const sameSlotStudents = await students(params.SAME_SLOT_STUDENTS, school.lessonMinutes);
const limitedOne = await limitedStudent(params.BALANCE_LESSONS);
const mixedStudents = await students(params.MIXED_SLOT_STUDENTS, school.lessonMinutes);
const limitedTwo = await limitedStudent(params.MIXED_LESSONS);

const started = Date.now();
const sameSlotResults = await sameSlot(0, sameSlotStudents, slot(0));
record('same slot', sameSlotResults);
checkSameSlot('same slot', sameSlotResults);

const limitedResults = await limitedBalance(1, limitedOne, params.BALANCE_ATTEMPTS, 0);
record('one student, limited credit', limitedResults);
checkLimited('limited credit', limitedResults, params.BALANCE_LESSONS);
await checkBalance('limited credit', limitedOne, 0);

const [mixedSlot, mixedLimited] = await Promise.all([
  sameSlot(2, mixedStudents, slot(0)),
  limitedBalance(2, limitedTwo, params.MIXED_ATTEMPTS, 1),
]);
record('mixed: same slot', mixedSlot);
record('mixed: limited credit', mixedLimited);
checkSameSlot('mixed same slot', mixedSlot);
checkLimited('mixed limited credit', mixedLimited, params.MIXED_LESSONS);
await checkBalance('mixed limited credit', limitedTwo, 0);
const elapsed = Date.now() - started;

sampling = false;
await sampler;
await samplerClient.end();
const { rows: overlaps } = await admin.query<{ count: number }>(
  `select count(*)::int as count from lessons a join lessons b
     on a.school_id = b.school_id and a.id < b.id and a.period && b.period
    and (a.instructor_membership_id = b.instructor_membership_id
         or a.vehicle_id = b.vehicle_id or a.student_id = b.student_id)
   where a.school_id = $1 and a.status in ('booked', 'completed') and b.status in ('booked', 'completed')`,
  [school.schoolId],
);
const { rows: negatives } = await admin.query<{ count: number }>(
  `select count(*)::int as count from (
     select student_id from ledger_entries where school_id = $1 group by student_id having sum(minutes) < 0
   ) n`,
  [school.schoolId],
);
const { rows: booked } = await admin.query<{ count: number }>(
  `select count(*)::int as count from lessons where school_id = $1 and status = 'booked'`,
  [school.schoolId],
);
await admin.end();

const expectedLessons = 2 + params.BALANCE_LESSONS + params.MIXED_LESSONS;
invariants.check(overlaps[0]?.count === 0, `${overlaps[0]?.count} overlapping lesson pairs`);
invariants.check(
  negatives[0]?.count === 0,
  `${negatives[0]?.count} students with a negative balance`,
);
invariants.check(minBalance >= 0, `minimum sampled balance ${minBalance}`);
invariants.check(
  booked[0]?.count === expectedLessons,
  `${booked[0]?.count} booked lessons, expected ${expectedLessons}`,
);

printTable(
  `Booking contention against ${env.API_URL} (school ${school.schoolId}, ${elapsed} ms)`,
  ['scenario', 'requests', 'results', 'p50 ms', 'p95 ms', 'max ms'],
  summary,
);
printTable(
  'Invariants',
  ['check', 'value'],
  [
    ['overlapping lesson pairs', overlaps[0]?.count ?? -1],
    ['students with negative ledger sum', negatives[0]?.count ?? -1],
    ['min sampled balance (minutes)', minBalance],
    ['booked lessons / expected', `${booked[0]?.count}/${expectedLessons}`],
  ],
);
invariants.finish();
