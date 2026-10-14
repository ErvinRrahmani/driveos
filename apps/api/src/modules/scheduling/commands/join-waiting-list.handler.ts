import { WaitingListJoined } from '@driveos/shared';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
  newEvent,
  QueryBus,
} from '../../../kernel/cqrs/index.js';
import { ConflictError, invalidField, notFound } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { GetStudentBookingProfileQuery } from '../../training/index.js';
import { forbidden, SchedulingAccess } from '../infra/access.js';
import { SlotValidator } from '../infra/slot-validator.js';
import { ViewerScope } from '../infra/viewer-scope.js';
import { WaitingListRecords } from '../infra/waiting-list-records.js';
import { JoinWaitingListCommand } from './join-waiting-list.command.js';

const WAITING_LIST_ENTRY_VERSION = 1;

@CommandHandler(JoinWaitingListCommand)
export class JoinWaitingListHandler implements ICommandHandler<
  JoinWaitingListCommand,
  CommandResult
> {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly access: SchedulingAccess,
    private readonly viewer: ViewerScope,
    private readonly slots: SlotValidator,
    private readonly records: WaitingListRecords,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ actor, body }: JoinWaitingListCommand): Promise<CommandResult> {
    const staff = await this.access.holdsAny(actor, ['waiting_list.manage']);
    if (!staff && !(await this.viewer.ownStudentIds(actor)).includes(body.studentId)) {
      throw forbidden();
    }
    const profile = await this.queryBus.execute(new GetStudentBookingProfileQuery(body.studentId));
    if (!profile) throw notFound();
    if (profile.status !== 'active') {
      throw new ConflictError('student_not_active', t('errors.student_not_active'));
    }
    const type = await this.slots.activeLessonType(body.lessonTypeId);
    if (type.licenceClass !== profile.licenceClass) {
      throw invalidField(['lessonTypeId'], 'the lesson type is for another licence class');
    }
    const entry = await this.records.insert({
      studentId: profile.studentId,
      lessonTypeId: type.id,
      preferredWindows: body.preferredWindows,
      area: body.area,
    });
    await this.publisher.append([
      newEvent(WaitingListJoined, {
        aggregateType: 'waiting_list',
        aggregateId: entry.id,
        aggregateVersion: WAITING_LIST_ENTRY_VERSION,
        payload: {
          waitingListEntryId: entry.id,
          studentId: entry.studentId,
          lessonTypeId: entry.lessonTypeId,
          preferredWindows: entry.preferredWindows,
          area: entry.area,
        },
      }),
    ]);
    return { id: entry.id, version: WAITING_LIST_ENTRY_VERSION };
  }
}
