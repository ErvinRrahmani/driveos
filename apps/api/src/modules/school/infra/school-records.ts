import { Injectable } from '@nestjs/common';
import {
  type Branch,
  SchoolSettingsChanged,
  type SchoolSettings,
  type Vehicle,
} from '@driveos/shared';
import { eq, inArray, sql } from 'drizzle-orm';
import { newEvent, type NewDomainEvent } from '../../../kernel/cqrs/index.js';
import { ApiError } from '../../../kernel/http/api-error.js';
import { notFound } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { type LocaleFields, localeRuleIssues } from '../domain/locale-rules.js';
import { branches, schools, schoolSettings, vehicles } from './schema.js';
import { StatusCodes } from 'http-status-codes';

export function assertLocaleRules(fields: LocaleFields): void {
  const issues = localeRuleIssues(fields);
  if (issues.length > 0) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'validation_error', t('errors.validation'), {
      issues,
    });
  }
}

export function hhmm(time: string): string {
  return time.slice(0, 5);
}

export function toSettings(row: typeof schoolSettings.$inferSelect): SchoolSettings {
  return {
    cancellationWindowHours: row.cancellationWindowHours,
    allowNegativeBalance: row.allowNegativeBalance,
    minGapMinutes: row.minGapMinutes,
    ageOfMajority: row.ageOfMajority,
    quietHoursStart: hhmm(row.quietHoursStart),
    quietHoursEnd: hhmm(row.quietHoursEnd),
    slotOfferTtlMinutes: row.slotOfferTtlMinutes,
    theoryPremiumFree: row.theoryPremiumFree,
    chatRetentionMonths: row.chatRetentionMonths,
  };
}

export function toBranch(row: typeof branches.$inferSelect): Branch {
  return { id: row.id, name: row.name, address: row.address, lat: row.lat, lng: row.lng };
}

export function toVehicle(row: typeof vehicles.$inferSelect): Vehicle {
  return {
    id: row.id,
    branchId: row.branchId,
    plate: row.plate,
    makeModel: row.makeModel,
    transmission: row.transmission as Vehicle['transmission'],
    licenceClass: row.licenceClass,
    active: row.active,
  };
}

@Injectable()
export class SchoolRecords {
  constructor(private readonly tenant: TenantContext) {}

  get schoolId(): string {
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('The school module needs a school in the tenant context');
    return schoolId;
  }

  async bumpVersion(): Promise<number> {
    const [row] = await this.tenant.tx
      .update(schools)
      .set({ version: sql`${schools.version} + 1` })
      .where(eq(schools.id, this.schoolId))
      .returning({ version: schools.version });
    if (!row) throw notFound();
    return row.version;
  }

  async settings(): Promise<SchoolSettings> {
    const [row] = await this.tenant.tx
      .select()
      .from(schoolSettings)
      .where(eq(schoolSettings.schoolId, this.schoolId));
    if (!row) throw notFound();
    return toSettings(row);
  }

  async settingsChanged(
    version: number,
    changedFields: string[],
  ): Promise<NewDomainEvent<typeof SchoolSettingsChanged>> {
    const [school] = await this.tenant.tx
      .select({ timeZone: schools.timeZone, currency: schools.currency, locale: schools.locale })
      .from(schools)
      .where(eq(schools.id, this.schoolId));
    if (!school) throw notFound();
    return newEvent(SchoolSettingsChanged, {
      aggregateType: 'school',
      aggregateId: this.schoolId,
      aggregateVersion: version,
      payload: {
        schoolId: this.schoolId,
        changedFields,
        ...school,
        settings: await this.settings(),
      },
    });
  }

  async missingBranchIds(ids: readonly string[]): Promise<string[]> {
    const wanted = [...new Set(ids)];
    if (wanted.length === 0) return [];
    const found = await this.tenant.tx
      .select({ id: branches.id })
      .from(branches)
      .where(inArray(branches.id, wanted));
    const existing = new Set(found.map((row) => row.id));
    return wanted.filter((id) => !existing.has(id));
  }

  async assertBranchesExist(ids: readonly string[]): Promise<void> {
    if ((await this.missingBranchIds(ids)).length > 0) throw notFound();
  }
}
