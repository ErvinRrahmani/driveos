import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { TenantContext } from '../tenant/tenant-context.js';

export interface PerSchoolFailure {
  schoolId: string;
  error: string;
}

export interface PerSchoolSummary {
  name: string;
  schools: number;
  succeeded: number;
  failed: PerSchoolFailure[];
}

@Injectable()
export class PerSchoolJobs {
  private readonly logger = new Logger('PerSchoolJobs');

  constructor(private readonly tenant: TenantContext) {}

  async runForEachSchool(
    name: string,
    work: (schoolId: string) => Promise<void>,
  ): Promise<PerSchoolSummary> {
    const schoolIds = await this.tenant.runAsSystem(async (tx) => {
      const result = await tx.execute<{ id: string }>(
        sql`select id from schools where status <> 'suspended' order by id`,
      );
      return result.rows.map((row) => row.id);
    });
    const summary: PerSchoolSummary = { name, schools: schoolIds.length, succeeded: 0, failed: [] };
    for (const schoolId of schoolIds) {
      try {
        await this.tenant.runInTenant({ schoolId, userId: null }, () => work(schoolId));
        summary.succeeded += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        summary.failed.push({ schoolId, error: message });
        this.logger.error({ msg: 'per-school job failed', job: name, schoolId, error: message });
      }
    }
    this.logger.log({
      msg: 'per-school job finished',
      job: name,
      schools: summary.schools,
      succeeded: summary.succeeded,
      failed: summary.failed.length,
    });
    return summary;
  }
}
