import { Body, Controller, Get, Post } from '@nestjs/common';
import { z } from 'zod';
import { CommandBus, type CommandResult, QueryBus } from '../../../../src/kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../../src/kernel/http/validation.js';
import { Idempotent } from '../../../../src/kernel/idempotency/idempotent.decorator.js';
import { RecordPingCommand } from '../commands/record-ping.command.js';
import { GetPingCountQuery, type PingCount } from '../queries/get-ping-count.query.js';

export const recordPingBody = z.object({ message: z.string().trim().min(1).max(200) }).strict();

type RecordPingBody = z.infer<typeof recordPingBody>;

@Controller('ping')
export class PingController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @Idempotent()
  record(
    @Body(new ZodValidationPipe(recordPingBody)) body: RecordPingBody,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new RecordPingCommand(body.message));
  }

  @Get()
  count(): Promise<PingCount> {
    return this.queryBus.execute(new GetPingCountQuery());
  }
}
