import type { EventDefinition } from '@driveos/shared';
import { DiscoveryService } from '@nestjs/core';
import type { DomainEvent } from '../cqrs/domain-event.js';

export interface Delivery {
  subscriber: string;
  attempt: number;
}

export interface EventHandler<TPayload = unknown> {
  handle(event: DomainEvent<TPayload>, delivery: Delivery): Promise<void>;
}

export interface EventSubscriberOptions {
  name: string;
  events: readonly EventDefinition[];
}

export interface SubscriberDefinition extends EventSubscriberOptions {
  handler: EventHandler;
}

export const EventSubscriber = DiscoveryService.createDecorator<EventSubscriberOptions>();

export const SUBSCRIBER_NAME = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
