import { performance } from 'node:perf_hooks';
import pg from 'pg';
import { z } from 'zod';
import { AccessTokenService } from '../../src/kernel/auth/access-token.js';
import { newId } from '../../src/kernel/db/columns.js';
import { loadDbToolEnv } from '../db/lib.js';

const loadEnvSchema = z.object({
  API_URL: z.url().default('http://localhost:13000'),
  AUTH_JWT_SECRET: z.string().min(32),
  DATABASE_ADMIN_URL: z.string().min(1),
});

export type LoadEnv = z.infer<typeof loadEnvSchema>;

export function loadEnv(): LoadEnv {
  loadDbToolEnv();
  return loadEnvSchema.parse(process.env);
}

export async function adminClient(env: LoadEnv): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: env.DATABASE_ADMIN_URL });
  await client.connect();
  return client;
}

export async function insert(
  client: pg.Client,
  table: string,
  row: Record<string, unknown>,
): Promise<string> {
  const values = { id: newId(), ...row };
  const columns = Object.keys(values);
  await client.query(
    `insert into ${table} (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
    Object.values(values),
  );
  return values.id;
}

export interface LoadMember {
  userId: string;
  membershipId: string;
  token: string;
}

export interface LoadStudent extends LoadMember {
  studentId: string;
}

export interface LoadSchool {
  schoolId: string;
  branchId: string;
  owner: LoadMember;
  instructors: LoadMember[];
  vehicleIds: string[];
  lessonTypeId: string;
  lessonMinutes: number;
}

export class LoadFixtures {
  private readonly tokens: AccessTokenService;

  constructor(
    private readonly client: pg.Client,
    secret: string,
  ) {
    this.tokens = new AccessTokenService({ secret, ttlSeconds: 3600 });
  }

  async school(label: string, options: { instructors: number; vehicles: number }) {
    const schoolId = newId();
    await this.client.query(
      `insert into schools (id, name, legal_name, address, country_code, time_zone, currency, locale, status)
       values ($1, $2, $2, '1 Load Street', 'DE', 'UTC', 'EUR', 'en', 'active')`,
      [schoolId, `Load test ${label}`],
    );
    await this.client.query('insert into school_settings (school_id) values ($1)', [schoolId]);
    const branchId = await insert(this.client, 'branches', {
      school_id: schoolId,
      name: 'Load branch',
      address: '1 Load Street',
      lat: 52.5,
      lng: 13.4,
    });
    const owner = await this.member(schoolId, ['owner']);
    const instructors: LoadMember[] = [];
    for (let i = 0; i < options.instructors; i += 1) {
      const instructor = await this.member(schoolId, ['instructor']);
      for (let weekday = 1; weekday <= 7; weekday += 1) {
        await insert(this.client, 'availability', {
          school_id: schoolId,
          instructor_membership_id: instructor.membershipId,
          weekday,
          start_time: '06:00',
          end_time: '22:00',
          valid_from: '2026-01-01',
        });
      }
      instructors.push(instructor);
    }
    const vehicleIds: string[] = [];
    for (let i = 0; i < options.vehicles; i += 1) {
      const id = newId();
      await insert(this.client, 'vehicles', {
        id,
        school_id: schoolId,
        branch_id: branchId,
        plate: `LT-${id.slice(-6)}`,
        make_model: 'VW Golf',
        transmission: 'manual',
        licence_class: 'B',
        active: true,
      });
      vehicleIds.push(id);
    }
    const lessonMinutes = 60;
    const lessonTypeId = await insert(this.client, 'lesson_types', {
      school_id: schoolId,
      name: 'Load lesson',
      kind: 'lesson',
      licence_class: 'B',
      minutes: lessonMinutes,
      credit_minutes: lessonMinutes,
      requires_vehicle: true,
      active: true,
    });
    const school: LoadSchool = {
      schoolId,
      branchId,
      owner,
      instructors,
      vehicleIds,
      lessonTypeId,
      lessonMinutes,
    };
    return school;
  }

  async student(school: LoadSchool, creditMinutes: number): Promise<LoadStudent> {
    const member = await this.member(school.schoolId, ['student']);
    const studentId = await insert(this.client, 'students', {
      school_id: school.schoolId,
      user_id: member.userId,
      full_name: `Load student ${member.userId.slice(-6)}`,
      date_of_birth: '2000-01-01',
      licence_class: 'B',
      exam_language: 'en',
      pickup_address: '1 Load Street',
      pickup_lat: 52.5,
      pickup_lng: 13.4,
      status: 'active',
    });
    if (creditMinutes > 0) {
      await insert(this.client, 'ledger_entries', {
        school_id: school.schoolId,
        student_id: studentId,
        entry_type: 'adjustment',
        minutes: creditMinutes,
        note: 'load test credit',
      });
    }
    return { ...member, studentId };
  }

  private async member(schoolId: string, roles: string[]): Promise<LoadMember> {
    const userId = await insert(this.client, 'users', {
      full_name: `Load ${roles.join('+')} ${newId().slice(-6)}`,
      locale: 'en',
    });
    const membershipId = await insert(this.client, 'memberships', {
      school_id: schoolId,
      user_id: userId,
      roles,
      status: 'active',
    });
    const { token } = await this.tokens.sign({ userId, membershipId, schoolId, roles });
    return { userId, membershipId, token };
  }
}

export interface Timed {
  status: number;
  code: string | null;
  ms: number;
  body: unknown;
}

export async function timedRequest(
  env: LoadEnv,
  method: string,
  path: string,
  token: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Timed> {
  const started = performance.now();
  const response = await fetch(new URL(path, env.API_URL), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const ms = performance.now() - started;
  const parsed = parseBody(text);
  const code = z.object({ error: z.object({ code: z.string() }) }).safeParse(parsed);
  return {
    status: response.status,
    code: code.success ? code.data.error.code : null,
    ms,
    body: parsed,
  };
}

function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

export function countBy(results: readonly Timed[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const result of results) {
    const key = result.code ? `${result.status} ${result.code}` : String(result.status);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function printTable(title: string, headers: string[], rows: (string | number)[][]): void {
  const cells = [headers, ...rows.map((row) => row.map(String))];
  const widths = headers.map((_, i) => Math.max(...cells.map((row) => (row[i] ?? '').length)));
  const line = (row: string[]) =>
    `| ${row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join(' | ')} |`;
  const output = [
    `\n${title}`,
    line(headers),
    line(widths.map((w) => '-'.repeat(w))),
    ...cells.slice(1).map(line),
  ];
  process.stdout.write(`${output.join('\n')}\n`);
}

export class Invariants {
  readonly failures: string[] = [];

  check(condition: boolean, message: string): void {
    if (!condition) this.failures.push(message);
  }

  finish(): never {
    if (this.failures.length > 0) {
      process.stdout.write(
        `\nINVARIANT VIOLATIONS:\n${this.failures.map((f) => `- ${f}`).join('\n')}\n`,
      );
      process.exit(1);
    }
    process.stdout.write('\nAll invariants held.\n');
    process.exit(0);
  }
}
