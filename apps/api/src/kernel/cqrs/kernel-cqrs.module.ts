import { Global, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { EventPublisher } from './event-publisher.js';

@Global()
@Module({
  imports: [CqrsModule.forRoot()],
  providers: [EventPublisher],
  exports: [EventPublisher],
})
export class KernelCqrsModule {}
