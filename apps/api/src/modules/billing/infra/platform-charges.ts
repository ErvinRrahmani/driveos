import { PlatformChargeCreated, type PlatformChargeKind } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { EventPublisher, newEvent } from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { monthOf } from '../domain/platform-fees.js';
import { platformCharges } from './schema.js';

const PLATFORM_CHARGE_AGGREGATE = 'platform_charge';

export interface NewPlatformCharge {
  kind: PlatformChargeKind;
  studentId: string | null;
  periodMonth: string;
  amountMinor: number;
  currency: string;
}

export interface CreatedPlatformCharge extends NewPlatformCharge {
  id: string;
}

const ONCE_PER_STUDENT = {
  student_fee: sql`kind = 'student_fee'`,
  student_fee_reversal: sql`kind = 'student_fee_reversal'`,
} as const;

export type OncePerStudentKind = keyof typeof ONCE_PER_STUDENT;

export interface StudentFeeCharge {
  id: string;
  amountMinor: number;
  currency: string;
  createdAt: Date;
}

@Injectable()
export class PlatformChargeRecords {
  constructor(
    private readonly tenant: TenantContext,
    private readonly events: EventPublisher,
  ) {}

  async insertOncePerStudent(
    charge: NewPlatformCharge & { kind: OncePerStudentKind; studentId: string },
  ): Promise<CreatedPlatformCharge | null> {
    const id = newId();
    const { rows } = await this.tenant.tx.execute<{ id: string }>(
      sql`insert into platform_charges
            (id, school_id, kind, student_id, period_month, amount_minor, currency, status)
          values (${id}, ${this.tenant.schoolId}, ${charge.kind}, ${charge.studentId},
                  ${charge.periodMonth}, ${charge.amountMinor}, ${charge.currency}, 'pending')
          on conflict (school_id, student_id) where ${ONCE_PER_STUDENT[charge.kind]}
          do nothing
          returning id`,
    );
    return rows.length > 0 ? { id, ...charge } : null;
  }

  async studentFee(studentId: string): Promise<StudentFeeCharge | null> {
    const [row] = await this.tenant.tx
      .select({
        id: platformCharges.id,
        amountMinor: platformCharges.amountMinor,
        currency: platformCharges.currency,
        createdAt: platformCharges.createdAt,
      })
      .from(platformCharges)
      .where(
        and(eq(platformCharges.kind, 'student_fee'), eq(platformCharges.studentId, studentId)),
      );
    return row ?? null;
  }

  async announce(charges: readonly CreatedPlatformCharge[]): Promise<void> {
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('Platform charges need a school scope');
    await this.events.append(
      charges.map((charge) =>
        newEvent(PlatformChargeCreated, {
          aggregateType: PLATFORM_CHARGE_AGGREGATE,
          aggregateId: charge.id,
          aggregateVersion: 1,
          payload: {
            chargeId: charge.id,
            schoolId,
            kind: charge.kind,
            studentId: charge.studentId,
            periodMonth: monthOf(charge.periodMonth),
            amountMinor: charge.amountMinor,
            currency: charge.currency,
          },
        }),
      ),
    );
  }
}
