import { eq } from 'drizzle-orm';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { assertLocaleRules, SchoolRecords } from '../infra/school-records.js';
import { schools } from '../infra/schema.js';
import { UpdateSchoolCommand } from './update-school.command.js';

@CommandHandler(UpdateSchoolCommand)
export class UpdateSchoolHandler implements ICommandHandler<UpdateSchoolCommand, CommandResult> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly records: SchoolRecords,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ patch }: UpdateSchoolCommand): Promise<CommandResult> {
    assertLocaleRules(patch);
    const changes = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    await this.tenant.tx.update(schools).set(changes).where(eq(schools.id, this.records.schoolId));
    const version = await this.records.bumpVersion();
    await this.publisher.append([
      await this.records.settingsChanged(version, Object.keys(changes)),
    ]);
    return { id: this.records.schoolId, version };
  }
}
