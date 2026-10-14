import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import {
  type EventHandler,
  EventSubscriber,
  SUBSCRIBER_NAME,
  type SubscriberDefinition,
} from './event-subscriber.js';

@Injectable()
export class SubscriberRegistry implements OnModuleInit {
  private readonly byName = new Map<string, SubscriberDefinition>();
  private readonly byType = new Map<string, string[]>();

  constructor(private readonly discovery: DiscoveryService) {}

  onModuleInit(): void {
    for (const wrapper of this.discovery.getProviders({ metadataKey: EventSubscriber.KEY })) {
      const options = this.discovery.getMetadataByDecorator(EventSubscriber, wrapper);
      const instance: unknown = wrapper.instance;
      if (!options || !isEventHandler(instance)) {
        throw new Error(`@EventSubscriber ${wrapper.name} must define handle(event, delivery)`);
      }
      this.register({ ...options, handler: instance });
    }
  }

  register(definition: SubscriberDefinition): void {
    const { name, events } = definition;
    if (!SUBSCRIBER_NAME.test(name)) {
      throw new Error(`Subscriber name "${name}" must be lowercase words joined by "." or "-"`);
    }
    if (this.byName.has(name)) throw new Error(`Subscriber "${name}" is registered twice`);
    if (events.length === 0) throw new Error(`Subscriber "${name}" listens to no events`);
    this.byName.set(name, definition);
    for (const type of new Set(events.map((event) => event.type))) {
      this.byType.set(type, [...(this.byType.get(type) ?? []), name].sort());
    }
  }

  subscribersFor(type: string): readonly string[] {
    return this.byType.get(type) ?? [];
  }

  get(name: string): SubscriberDefinition {
    const definition = this.byName.get(name);
    if (!definition) throw new Error(`No subscriber "${name}" is registered in this worker`);
    return definition;
  }

  names(): string[] {
    return [...this.byName.keys()].sort();
  }

  pairs(): { type: string; subscriber: string }[] {
    return [...this.byType].flatMap(([type, names]) =>
      names.map((subscriber) => ({ type, subscriber })),
    );
  }
}

function isEventHandler(value: unknown): value is EventHandler {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { handle?: unknown }).handle === 'function'
  );
}
