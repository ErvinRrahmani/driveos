import {
  CommandHandler,
  type CommandResult,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { ConflictError } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { SlotOfferCreator } from '../infra/slot-offer-creator.js';
import { CreateSlotOfferCommand } from './create-slot-offer.command.js';

@CommandHandler(CreateSlotOfferCommand)
export class CreateSlotOfferHandler implements ICommandHandler<
  CreateSlotOfferCommand,
  CommandResult
> {
  constructor(private readonly creator: SlotOfferCreator) {}

  async execute({ body, source }: CreateSlotOfferCommand): Promise<CommandResult> {
    const created = await this.creator.create({
      instructorMembershipId: body.instructorMembershipId,
      vehicleId: body.vehicleId ?? null,
      lessonTypeId: body.lessonTypeId,
      start: new Date(body.start),
      source,
      studentIds: body.studentIds,
    });
    if (!created) {
      throw new ConflictError('no_eligible_students', t('errors.no_eligible_students'));
    }
    return { id: created.id, version: created.version };
  }
}
