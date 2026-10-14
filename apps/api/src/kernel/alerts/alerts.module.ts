import { Global, Module } from '@nestjs/common';
import { WorkerKernelModule } from '../worker/worker-kernel.module.js';
import { AlertMonitor } from './alert-monitor.js';
import { AlertProbes } from './alert-probes.js';
import { AlertStore } from './alert-store.js';
import { SubscriberBacklog } from './subscriber-backlog.js';

@Global()
@Module({
  imports: [WorkerKernelModule],
  providers: [AlertProbes, AlertStore, AlertMonitor, SubscriberBacklog],
  exports: [AlertProbes, AlertStore, AlertMonitor, SubscriberBacklog],
})
export class AlertsModule {}
