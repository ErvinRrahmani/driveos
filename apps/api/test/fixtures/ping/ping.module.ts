import { Module } from '@nestjs/common';
import { RecordPingHandler } from './commands/record-ping.handler.js';
import { PingController } from './http/ping.controller.js';
import { GetPingCountHandler } from './queries/get-ping-count.handler.js';

@Module({
  controllers: [PingController],
  providers: [RecordPingHandler, GetPingCountHandler],
})
export class PingModule {}
