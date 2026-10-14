import { LessonCompleted } from '@driveos/shared';
import {
  CommandBus,
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
  newEvent,
} from '../../../kernel/cqrs/index.js';
import { RecordProgressCommand, UpsertPrivateNoteCommand } from '../../training/index.js';
import { LessonOutcomes } from '../infra/lesson-outcomes.js';
import { CompleteLessonCommand } from './complete-lesson.command.js';

@CommandHandler(CompleteLessonCommand)
export class CompleteLessonHandler implements ICommandHandler<
  CompleteLessonCommand,
  CommandResult
> {
  constructor(
    private readonly outcomes: LessonOutcomes,
    private readonly commandBus: CommandBus,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ actor, lessonId, body }: CompleteLessonCommand): Promise<CommandResult> {
    const { lesson } = await this.outcomes.lockRecordable(actor, lessonId, body.version);
    const version = await this.outcomes.record(lesson, 'completed');
    await this.publisher.append([
      newEvent(LessonCompleted, {
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
        },
      }),
    ]);
    const target = { lessonId: lesson.id, studentId: lesson.studentId };
    if (body.progress.length > 0) {
      await this.commandBus.execute(
        new RecordProgressCommand(actor, { ...target, entries: body.progress }),
      );
    }
    if (body.privateNote !== undefined) {
      await this.commandBus.execute(
        new UpsertPrivateNoteCommand(actor, { ...target, body: body.privateNote }),
      );
    }
    return { id: lesson.id, version };
  }
}
