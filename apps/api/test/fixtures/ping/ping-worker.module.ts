import { Module } from '@nestjs/common';
import { PingCountProjection } from './projections/ping-count.projection.js';
import { PingRecordedSubscriber } from './subscribers/ping-recorded.subscriber.js';

@Module({ providers: [PingRecordedSubscriber, PingCountProjection] })
export class PingWorkerModule {}
