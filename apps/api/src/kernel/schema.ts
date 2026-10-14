import { bigserial, integer, jsonb, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { schoolId } from '../modules/school/infra/schema.js';
import { id, timestamps, tstz } from './db/columns.js';

export const outbox = pgTable('outbox', {
  seq: bigserial('seq', { mode: 'number' }).primaryKey(),
  id: uuid('id').notNull().unique('outbox_id_key'),
  schoolId: uuid('school_id'),
  type: text('type').notNull(),
  version: integer('version').notNull(),
  aggregateType: text('aggregate_type').notNull(),
  aggregateId: uuid('aggregate_id').notNull(),
  aggregateVersion: integer('aggregate_version').notNull(),
  actorUserId: uuid('actor_user_id'),
  occurredAt: tstz('occurred_at').notNull(),
  payload: jsonb('payload').notNull(),
  publishedAt: tstz('published_at'),
  ...timestamps(),
});

export const eventDeliveries = pgTable(
  'event_deliveries',
  {
    subscriber: text('subscriber').notNull(),
    eventId: uuid('event_id').notNull(),
    deliveredAt: tstz('delivered_at').notNull(),
    ...timestamps(),
  },
  (t) => [primaryKey({ name: 'event_deliveries_pkey', columns: [t.subscriber, t.eventId] })],
);

export const deadLetters = pgTable('dead_letters', {
  id: id(),
  subscriber: text('subscriber').notNull(),
  eventId: uuid('event_id').notNull(),
  error: text('error').notNull(),
  attempts: integer('attempts').notNull(),
  failedAt: tstz('failed_at').notNull(),
  ...timestamps(),
});

export const projectionPositions = pgTable(
  'projection_positions',
  {
    schoolId: schoolId(),
    projection: text('projection').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    aggregateVersion: integer('aggregate_version').notNull(),
    ...timestamps(),
  },
  (t) => [
    primaryKey({
      name: 'projection_positions_pkey',
      columns: [t.projection, t.aggregateType, t.aggregateId],
    }),
  ],
);
