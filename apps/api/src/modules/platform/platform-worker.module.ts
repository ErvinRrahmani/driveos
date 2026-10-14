import { Module } from '@nestjs/common';
import { GetCurrentSubscriptionHandler } from './queries/get-current-subscription.handler.js';

@Module({
  providers: [GetCurrentSubscriptionHandler],
})
export class PlatformWorkerModule {}
