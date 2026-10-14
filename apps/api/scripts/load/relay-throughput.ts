import { z } from 'zod';
import { newId } from '../../src/kernel/db/columns.js';
import { adminClient, Invariants, LoadFixtures, loadEnv, printTable } from './lib.js';

const SUBSCRIBER = 'scheduling.change-feed';

const params = z
  .object({
    RELAY_EVENTS: z.coerce.number().int().min(1).default(2000),
    RELAY_MAX_SECONDS: z.coerce.number().positive().default(60),
  })
  .parse(process.env);

const env = loadEnv();
const admin = await adminClient(env);
const invariants = new Invariants();
const fixtures = new LoadFixtures(admin, env.AUTH_JWT_SECRET);
const school = await fixtures.school(`relay ${new Date().toISOString()}`, {
  instructors: 0,
  vehicles: 0,
});

const ids = Array.from({ length: params.RELAY_EVENTS }, () => newId());
const vehicleIds = ids.map(() => newId());
const inserted = Date.now();
await admin.query(
  `insert into outbox (id, school_id, type, version, aggregate_type, aggregate_id, aggregate_version,
     occurred_at, payload)
   select e.id, $1, 'VehicleChanged', 1, 'vehicle', e.vehicle_id, 1, now(),
     jsonb_build_object('vehicleId', e.vehicle_id, 'change', 'updated', 'branchId', $2::uuid,
       'plate', 'LT-' || left(e.vehicle_id::text, 6), 'makeModel', 'VW Golf',
       'transmission', 'manual', 'licenceClass', 'B', 'active', true)
   from unnest($3::uuid[], $4::uuid[]) as e(id, vehicle_id)`,
  [school.schoolId, school.branchId, ids, vehicleIds],
);

interface Progress {
  published: number;
  delivered: number;
}

async function progress(): Promise<Progress> {
  const { rows } = await admin.query<Progress>(
    `select
       (select count(*)::int from outbox where id = any($1::uuid[]) and published_at is not null) as published,
       (select count(*)::int from event_deliveries where subscriber = $2 and event_id = any($1::uuid[])) as delivered`,
    [ids, SUBSCRIBER],
  );
  return rows[0] ?? { published: 0, delivered: 0 };
}

const deadline = inserted + params.RELAY_MAX_SECONDS * 1000;
let current = await progress();
let publishedAt: number | null = null;
while (current.delivered < ids.length && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 100));
  current = await progress();
  if (publishedAt === null && current.published === ids.length) publishedAt = Date.now();
}
const drainedMs = Date.now() - inserted;

const { rows: lag } = await admin.query<{
  relay_max: number;
  delivery_max: number;
  delivery_p95: number;
}>(
  `select
     (extract(epoch from max(o.published_at - o.created_at)) * 1000)::float8 as relay_max,
     (extract(epoch from max(d.delivered_at - o.created_at)) * 1000)::float8 as delivery_max,
     (extract(epoch from percentile_cont(0.95) within group (order by d.delivered_at - o.created_at)) * 1000)::float8
       as delivery_p95
   from outbox o join event_deliveries d on d.event_id = o.id and d.subscriber = $2
   where o.id = any($1::uuid[])`,
  [ids, SUBSCRIBER],
);
const { rows: dead } = await admin.query<{ count: number }>(
  'select count(*)::int as count from dead_letters where event_id = any($1::uuid[])',
  [ids],
);
await admin.end();

const seconds = drainedMs / 1000;
invariants.check(
  current.delivered === ids.length,
  `${current.delivered}/${ids.length} events delivered to ${SUBSCRIBER} within ${params.RELAY_MAX_SECONDS} s`,
);
invariants.check(dead[0]?.count === 0, `${dead[0]?.count} events dead-lettered`);

printTable(
  `Outbox relay throughput (school ${school.schoolId}, subscriber ${SUBSCRIBER})`,
  ['metric', 'value'],
  [
    ['events', ids.length],
    ['published / delivered', `${current.published}/${current.delivered}`],
    ['all published after (ms)', publishedAt === null ? 'n/a' : publishedAt - inserted],
    ['drained after (ms)', drainedMs],
    ['throughput (events/s)', (current.delivered / seconds).toFixed(1)],
    ['max relay lag (ms)', Math.round(lag[0]?.relay_max ?? 0)],
    ['p95 delivery lag (ms)', Math.round(lag[0]?.delivery_p95 ?? 0)],
    ['max delivery lag (ms)', Math.round(lag[0]?.delivery_max ?? 0)],
    ['dead letters', dead[0]?.count ?? -1],
  ],
);
invariants.finish();
