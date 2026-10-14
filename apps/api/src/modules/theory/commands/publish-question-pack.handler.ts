import { QuestionPackPublished } from '@driveos/shared';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
  newEvent,
} from '../../../kernel/cqrs/index.js';
import { ConflictError, notFound } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { QuestionPacksRepository } from '../infra/question-packs.repository.js';
import { PublishQuestionPackCommand } from './publish-question-pack.command.js';

export const QUESTION_PACK_AGGREGATE = 'question_pack';
const PUBLISHED_VERSION = 2;

@CommandHandler(PublishQuestionPackCommand)
export class PublishQuestionPackHandler implements ICommandHandler<
  PublishQuestionPackCommand,
  CommandResult
> {
  constructor(
    private readonly packs: QuestionPacksRepository,
    private readonly events: EventPublisher,
  ) {}

  async execute({ packId }: PublishQuestionPackCommand): Promise<CommandResult> {
    const pack = await this.packs.findForUpdate(packId);
    if (!pack) throw notFound();
    if (pack.status === 'published') {
      throw new ConflictError(
        'question_pack_already_published',
        t('errors.question_pack_already_published'),
      );
    }
    const publishedAt = new Date();
    await this.packs.markPublished(pack.id, publishedAt);
    await this.events.append([
      newEvent(QuestionPackPublished, {
        aggregateType: QUESTION_PACK_AGGREGATE,
        aggregateId: pack.id,
        aggregateVersion: PUBLISHED_VERSION,
        occurredAt: publishedAt,
        payload: {
          packId: pack.id,
          countryCode: pack.countryCode,
          licenceClass: pack.licenceClass,
          language: pack.language,
          packVersion: pack.version,
          questionCount: await this.packs.questionCount(pack.id),
          publishedAt: publishedAt.toISOString(),
        },
      }),
    ]);
    return { id: pack.id, version: PUBLISHED_VERSION };
  }
}
