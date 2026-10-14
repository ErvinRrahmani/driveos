import { Module } from '@nestjs/common';
import { GetHealthHandler } from './get-health.handler.js';
import { HealthController } from './health.controller.js';

@Module({
  controllers: [HealthController],
  providers: [GetHealthHandler],
})
export class HealthModule {}
