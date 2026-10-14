import type { EventDefinition, EventPayload } from '@driveos/shared';
import pg from 'pg';
import type { DomainEvent } from '../../src/kernel/cqrs/index.js';
import type { ScratchDatabase } from '../db/scratch-database.js';

export type EventSource = Pick<ScratchDatabase, 'systemUrl'>;

export interface RecordedEvent<TPayload = unknown> extends DomainEvent<TPayload> {
  seq: number;
  publishedAt: Date | null;
}

export interface EventFilter {
  type?: string | EventDefinition;
  aggregateType?: string;
  aggregateId?: string;
  schoolId?: string | null;
}

export type TypedEventFilter<D extends EventDefinition> = Omit<EventFilter, 'type'> & { type: D };

export interface AppendedOptions {
  count?: number;
}

interface OutboxRow {
  seq: string;
  id: string;
  school_id: string | null;
  type: string;
  version: number;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: number;
  actor_user_id: string | null;
  occurred_at: Date;
  payload: unknown;
  published_at: Date | null;
}

function typeName(filter: EventFilter): string {
  if (filter.type === undefined) return '';
  return typeof filter.type === 'string' ? filter.type : filter.type.type;
}

function describeFilter(filter: EventFilter): string {
  const { type, ...rest } = filter;
  const shown = type === undefined ? rest : { type: typeName(filter), ...rest };
  return JSON.stringify(shown);
}

function toEvent(row: OutboxRow, definition: EventDefinition | undefined): RecordedEvent {
  return {
    seq: Number(row.seq),
    id: row.id,
    type: row.type,
    version: row.version,
    schoolId: row.school_id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    aggregateVersion: row.aggregate_version,
    actorUserId: row.actor_user_id,
    occurredAt: row.occurred_at,
    payload: definition ? definition.schema.parse(row.payload) : row.payload,
    publishedAt: row.published_at,
  };
}

async function readOutbox(db: EventSource, filter: EventFilter): Promise<RecordedEvent[]> {
  const definition = typeof filter.type === 'object' ? filter.type : undefined;
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (column: string, value: unknown) => {
    params.push(value);
    where.push(`${column} = $${params.length}`);
  };
  if (filter.type !== undefined) add('type', typeName(filter));
  if (definition) add('version', definition.version);
  if (filter.aggregateType !== undefined) add('aggregate_type', filter.aggregateType);
  if (filter.aggregateId !== undefined) add('aggregate_id', filter.aggregateId);
  if (filter.schoolId === null) where.push('school_id is null');
  else if (filter.schoolId !== undefined) add('school_id', filter.schoolId);

  const client = new pg.Client({ connectionString: db.systemUrl });
  await client.connect();
  try {
    const result = await client.query<OutboxRow>(
      `select * from outbox ${where.length ? `where ${where.join(' and ')}` : ''} order by seq`,
      params,
    );
    return result.rows.map((row) => toEvent(row, definition));
  } finally {
    await client.end();
  }
}

export function expectEvents<D extends EventDefinition>(
  db: EventSource,
  filter: TypedEventFilter<D>,
): Promise<RecordedEvent<EventPayload<D>>[]>;
export function expectEvents(db: EventSource, filter?: EventFilter): Promise<RecordedEvent[]>;
export function expectEvents(db: EventSource, filter: EventFilter = {}) {
  return readOutbox(db, filter);
}

export async function expectEventAppended<D extends EventDefinition>(
  db: EventSource,
  filter: TypedEventFilter<D>,
  options?: AppendedOptions,
): Promise<RecordedEvent<EventPayload<D>>>;
export async function expectEventAppended(
  db: EventSource,
  filter: EventFilter,
  options?: AppendedOptions,
): Promise<RecordedEvent>;
export async function expectEventAppended(
  db: EventSource,
  filter: EventFilter,
  options: AppendedOptions = {},
) {
  const found = await readOutbox(db, filter);
  const name = typeName(filter) || 'matching';
  if (options.count !== undefined && found.length !== options.count) {
    throw new Error(
      `Expected ${options.count} ${name} event(s) for ${describeFilter(filter)}, found ${found.length}`,
    );
  }
  const last = found.at(-1);
  if (!last) {
    const all = await readOutbox(db, {});
    const seen = all.map((event) => `${event.type}(${event.aggregateId})`).join(', ') || 'none';
    throw new Error(
      `Expected at least one ${name} event for ${describeFilter(filter)}; outbox has: ${seen}`,
    );
  }
  return last;
}

export async function expectNoEvent(db: EventSource, filter: EventFilter): Promise<void> {
  const found = await readOutbox(db, filter);
  if (found.length > 0) {
    const ids = found.map((event) => event.id).join(', ');
    throw new Error(
      `Expected no ${typeName(filter) || 'matching'} event for ${describeFilter(filter)}, found ${found.length}: ${ids}`,
    );
  }
}

export async function lastEventOf<D extends EventDefinition>(
  db: EventSource,
  type: D,
  filter?: Omit<EventFilter, 'type'>,
): Promise<RecordedEvent<EventPayload<D>> | undefined>;
export async function lastEventOf(
  db: EventSource,
  type: string,
  filter?: Omit<EventFilter, 'type'>,
): Promise<RecordedEvent | undefined>;
export async function lastEventOf(
  db: EventSource,
  type: string | EventDefinition,
  filter: Omit<EventFilter, 'type'> = {},
) {
  return (await readOutbox(db, { ...filter, type })).at(-1);
}
