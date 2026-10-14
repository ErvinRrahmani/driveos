import { Module } from '@nestjs/common';
import { GetCurrentSubscriptionHandler } from './queries/get-current-subscription.handler.js';
import { SchoolHasFeatureHandler } from './queries/school-has-feature.handler.js';

/** Platform queries the worker's subscribers need (messaging's review request checks the plan). */
@Module({
  providers: [GetCurrentSubscriptionHandler, SchoolHasFeatureHandler],
})
export class PlatformWorkerModule {}
