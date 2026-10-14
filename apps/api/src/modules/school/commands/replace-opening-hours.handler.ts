import type { OpeningHoursResponse } from '@driveos/shared';
import { eq } from 'drizzle-orm';
import {
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { invalidField } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { openingHoursOverlaps } from '../domain/opening-hours.js';
import { SchoolRecords } from '../infra/school-records.js';
import { openingHours } from '../infra/schema.js';
import { ReplaceOpeningHoursCommand } from './replace-opening-hours.command.js';

@CommandHandler(ReplaceOpeningHoursCommand)
export class ReplaceOpeningHoursHandler implements ICommandHandler<
  ReplaceOpeningHoursCommand,
  OpeningHoursResponse
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly records: SchoolRecords,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ body }: ReplaceOpeningHoursCommand): Promise<OpeningHoursResponse> {
    const [overlap] = openingHoursOverlaps(body.items);
    if (overlap !== undefined) {
      throw invalidField(['items', overlap], 'Overlaps another range of the same day');
    }
    await this.records.assertBranchesExist(
      body.items.flatMap((item) => (item.branchId ? [item.branchId] : [])),
    );
    const schoolId = this.records.schoolId;
    const items = body.items.map((item) => ({ id: newId(), ...item }));
    await this.tenant.tx.delete(openingHours).where(eq(openingHours.schoolId, schoolId));
    if (items.length > 0) {
      await this.tenant.tx
        .insert(openingHours)
        .values(items.map((item) => ({ ...item, schoolId })));
    }
    const version = await this.records.bumpVersion();
    await this.publisher.append([await this.records.settingsChanged(version, ['openingHours'])]);
    return { items };
  }
}
