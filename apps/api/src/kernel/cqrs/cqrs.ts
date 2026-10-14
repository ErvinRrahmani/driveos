export {
  Command,
  CommandBus,
  CommandHandler,
  type ICommandHandler,
  type IQueryHandler,
  Query,
  QueryBus,
  QueryHandler,
} from '@nestjs/cqrs';

export interface CommandResult {
  id: string;
  version: number;
}
