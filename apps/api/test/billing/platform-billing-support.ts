import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { insertRow } from '../db/fixtures.js';

export interface PlanInput {
  baseAmountMinor: number;
  studentFeeMinor: number;
  currency?: string;
}

export async function insertPlan(system: pg.Client, plan: PlanInput): Promise<string> {
  const code = `plan-${randomUUID().slice(0, 8)}`;
  return insertRow(system, 'plans', {
    code,
    name: code,
    base_amount_minor: plan.baseAmountMinor,
    student_fee_minor: plan.studentFeeMinor,
    currency: plan.currency ?? 'EUR',
    active: true,
  });
}

export function subscribe(
  system: pg.Client,
  schoolId: string,
  planId: string,
  startedAt: string,
): Promise<string> {
  return insertRow(system, 'subscriptions', {
    school_id: schoolId,
    plan_id: planId,
    started_at: new Date(startedAt),
  });
}

export interface ChargeRow {
  id: string;
  kind: string;
  student_id: string | null;
  period_month: string;
  amount_minor: number;
  currency: string;
  status: string;
  statement_id: string | null;
}

export async function chargesOf(system: pg.Client, schoolId: string): Promise<ChargeRow[]> {
  const { rows } = await system.query<ChargeRow>(
    `select id, kind, student_id, to_char(period_month, 'YYYY-MM-DD') as period_month,
            amount_minor::int as amount_minor, currency, status, statement_id
       from platform_charges where school_id = $1 order by created_at, id`,
    [schoolId],
  );
  return rows;
}

export interface StatementRow {
  id: string;
  month: string;
  total_minor: number;
  currency: string;
  status: string;
}

export async function statementsOf(system: pg.Client, schoolId: string): Promise<StatementRow[]> {
  const { rows } = await system.query<StatementRow>(
    `select id, to_char(month, 'YYYY-MM') as month, total_minor::int as total_minor, currency,
            status::text as status
       from platform_statements where school_id = $1 order by month`,
    [schoolId],
  );
  return rows;
}

export function pendingCharge(
  system: pg.Client,
  schoolId: string,
  charge: { kind: string; studentId: string | null; periodMonth: string; amountMinor: number },
): Promise<string> {
  return insertRow(system, 'platform_charges', {
    school_id: schoolId,
    kind: charge.kind,
    student_id: charge.studentId,
    period_month: charge.periodMonth,
    amount_minor: charge.amountMinor,
    currency: 'EUR',
    status: 'pending',
  });
}
