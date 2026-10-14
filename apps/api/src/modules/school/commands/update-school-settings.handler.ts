import { eq } from 'drizzle-orm';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { SchoolRecords } from '../infra/school-records.js';
import { schoolSettings } from '../infra/schema.js';
import { UpdateSchoolSettingsCommand } from './update-school-settings.command.js';

@CommandHandler(UpdateSchoolSettingsCommand)
export class UpdateSchoolSettingsHandler implements ICommandHandler<
  UpdateSchoolSettingsCommand,
  CommandResult
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly records: SchoolRecords,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ patch }: UpdateSchoolSettingsCommand): Promise<CommandResult> {
    const changes = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    await this.tenant.tx
      .update(schoolSettings)
      .set(changes)
      .where(eq(schoolSettings.schoolId, this.records.schoolId));
    const version = await this.records.bumpVersion();
    await this.publisher.append([
      await this.records.settingsChanged(version, Object.keys(changes)),
    ]);
    return { id: this.records.schoolId, version };
  }
}
