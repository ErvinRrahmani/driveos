import { LessonMarkedNoShow } from '@driveos/shared';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
  newEvent,
} from '../../../kernel/cqrs/index.js';
import { LessonOutcomes } from '../infra/lesson-outcomes.js';
import { MarkNoShowCommand } from './mark-no-show.command.js';

@CommandHandler(MarkNoShowCommand)
export class MarkNoShowHandler implements ICommandHandler<MarkNoShowCommand, CommandResult> {
  constructor(
    private readonly outcomes: LessonOutcomes,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ actor, lessonId, body }: MarkNoShowCommand): Promise<CommandResult> {
    const { lesson, by } = await this.outcomes.lockRecordable(actor, lessonId, body.version);
    const version = await this.outcomes.record(lesson, 'no_show');
    await this.publisher.append([
      newEvent(LessonMarkedNoShow, {
        aggregateType: 'lesson',
        aggregateId: lesson.id,
        aggregateVersion: version,
        payload: {
          lessonId: lesson.id,
          studentId: lesson.studentId,
          instructorMembershipId: lesson.instructorMembershipId,
          lessonTypeId: lesson.lessonTypeId,
          start: lesson.period.start.toISOString(),
          end: lesson.period.end.toISOString(),
          creditMinutes: lesson.creditMinutes,
          markedByMembershipId: by,
        },
      }),
    ]);
    return { id: lesson.id, version };
  }
}
