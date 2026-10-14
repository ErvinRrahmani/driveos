import { CommandHandler, type ICommandHandler } from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { SchedulingAccess } from '../infra/access.js';
import { ViewerScope } from '../infra/viewer-scope.js';
import { WaitingListRecords } from '../infra/waiting-list-records.js';
import { LeaveWaitingListCommand } from './leave-waiting-list.command.js';

@CommandHandler(LeaveWaitingListCommand)
export class LeaveWaitingListHandler implements ICommandHandler<LeaveWaitingListCommand, void> {
  constructor(
    private readonly access: SchedulingAccess,
    private readonly viewer: ViewerScope,
    private readonly records: WaitingListRecords,
  ) {}

  async execute({ actor, entryId }: LeaveWaitingListCommand): Promise<void> {
    const entry = await this.records.find(entryId);
    if (!entry) throw notFound();
    if (!(await this.access.holdsAny(actor, ['waiting_list.manage']))) {
      if (!(await this.viewer.ownStudentIds(actor)).includes(entry.studentId)) throw notFound();
    }
    if (entry.active) await this.records.deactivate(entry.id);
  }
}
