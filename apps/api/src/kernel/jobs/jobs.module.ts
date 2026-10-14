import { Global, Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module.js';
import { JobProcessors } from './job-processors.js';
import { PerSchoolJobs } from './per-school.js';
import { JobQueues } from './queues.js';
import { ScheduledJobs } from './scheduled-jobs.js';

@Global()
@Module({
  imports: [RedisModule],
  providers: [JobQueues, ScheduledJobs, PerSchoolJobs, JobProcessors],
  exports: [JobQueues, ScheduledJobs, PerSchoolJobs, JobProcessors],
})
export class JobsModule {}
