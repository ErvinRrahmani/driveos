import { newId } from '../../../../src/kernel/db/columns.js';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
  newEvent,
} from '../../../../src/kernel/cqrs/index.js';
import { normalizePingMessage } from '../domain/ping-message.js';
import { PingRecorded } from '../events/ping-recorded.event.js';
import { RecordPingCommand } from './record-ping.command.js';

@CommandHandler(RecordPingCommand)
export class RecordPingHandler implements ICommandHandler<RecordPingCommand, CommandResult> {
  constructor(private readonly events: EventPublisher) {}

  async execute(command: RecordPingCommand): Promise<CommandResult> {
    const id = newId();
    await this.events.append([
      newEvent(PingRecorded, {
        aggregateType: 'ping',
        aggregateId: id,
        aggregateVersion: 1,
        payload: { message: normalizePingMessage(command.message) },
      }),
    ]);
    return { id, version: 1 };
  }
}
