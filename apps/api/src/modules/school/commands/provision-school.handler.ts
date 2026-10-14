import { SchoolCreated } from '@driveos/shared';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
  newEvent,
} from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { assertLocaleRules } from '../infra/school-records.js';
import { schools, schoolSettings } from '../infra/schema.js';
import { ProvisionSchoolCommand } from './provision-school.command.js';

@CommandHandler(ProvisionSchoolCommand)
export class ProvisionSchoolHandler implements ICommandHandler<
  ProvisionSchoolCommand,
  CommandResult
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ schoolId, profile, planId }: ProvisionSchoolCommand): Promise<CommandResult> {
    if (this.tenant.schoolId !== schoolId) {
      throw new Error('ProvisionSchool must run in the new school tenant scope');
    }
    assertLocaleRules(profile);
    await this.tenant.tx.insert(schools).values({
      id: schoolId,
      name: profile.name,
      legalName: profile.legalName,
      taxId: profile.taxId ?? null,
      address: profile.address,
      countryCode: profile.countryCode,
      timeZone: profile.timeZone,
      currency: profile.currency,
      locale: profile.locale,
      status: profile.status,
    });
    await this.tenant.tx.insert(schoolSettings).values({ schoolId });
    await this.publisher.append([
      newEvent(SchoolCreated, {
        aggregateType: 'school',
        aggregateId: schoolId,
        aggregateVersion: 1,
        payload: {
          schoolId,
          name: profile.name,
          legalName: profile.legalName,
          countryCode: profile.countryCode,
          timeZone: profile.timeZone,
          currency: profile.currency,
          locale: profile.locale,
          status: profile.status,
          planId,
        },
      }),
    ]);
    return { id: schoolId, version: 1 };
  }
}
