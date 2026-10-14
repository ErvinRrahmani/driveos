import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { defineEvent } from '@driveos/shared';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  Command,
  CommandBus,
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
  newEvent,
} from '../../src/kernel/cqrs/index.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { createSchoolFixture, type SchoolFixture } from '../db/fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';

const BranchOpened = defineEvent({
  type: 'BranchOpened',
  version: 1,
  schema: z.object({ name: z.string() }),
});

interface Opened extends CommandResult {
  txid: string;
}

class OpenBranchCommand extends Command<Opened> {
  constructor(readonly name: string) {
    super();
  }
}

class OpenTwoBranchesCommand extends Command<{ outer: string; inner: string }> {
  constructor(
    readonly name: string,
    readonly failAfterInner: boolean,
  ) {
    super();
  }
}

async function insertBranch(tenant: TenantContext, name: string): Promise<string> {
  const id = randomUUID();
  await tenant.tx.execute(sql`insert into branches (id, school_id, name, address, lat, lng)
    values (${id}, ${tenant.schoolId}, ${name}, 'x', 0, 0)`);
  return id;
}

async function currentTxid(tenant: TenantContext): Promise<string> {
  const result = await tenant.tx.execute<{ txid: string }>(sql`select txid_current() as txid`);
  const [row] = result.rows;
  if (!row) throw new Error('txid_current() returned no row');
  return String(row.txid);
}

@CommandHandler(OpenBranchCommand)
class OpenBranchHandler implements ICommandHandler<OpenBranchCommand, Opened> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly events: EventPublisher,
  ) {}

  async execute(command: OpenBranchCommand): Promise<Opened> {
    const id = await insertBranch(this.tenant, command.name);
    await this.events.append([
      newEvent(BranchOpened, {
        aggregateType: 'branch',
        aggregateId: id,
        aggregateVersion: 1,
        payload: { name: command.name },
      }),
    ]);
    return { id, version: 1, txid: await currentTxid(this.tenant) };
  }
}

@CommandHandler(OpenTwoBranchesCommand)
class OpenTwoBranchesHandler implements ICommandHandler<OpenTwoBranchesCommand> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(command: OpenTwoBranchesCommand): Promise<{ outer: string; inner: string }> {
    await insertBranch(this.tenant, `${command.name} outer`);
    const inner = await this.commandBus.execute(new OpenBranchCommand(`${command.name} inner`));
    if (command.failAfterInner) throw new Error('outer handler failed after the sub-command');
    return { outer: await currentTxid(this.tenant), inner: inner.txid };
  }
}

@Module({ providers: [OpenBranchHandler, OpenTwoBranchesHandler] })
class BranchProbeModule {}

describe('a sub-command executed from a handler joins the same transaction', () => {
  let db: ScratchDatabase;
  let system: pg.Client;
  let school: SchoolFixture;
  let kernel: KernelTestApp;
  let tenant: TenantContext;
  let commandBus: CommandBus;

  const branchesNamed = async (prefix: string) =>
    (
      await system.query<{ name: string }>(
        'select name from branches where name like $1 order by name',
        [`${prefix}%`],
      )
    ).rows.map((row) => row.name);

  const outboxFor = async (name: string) =>
    (await system.query("select 1 from outbox where payload->>'name' = $1", [name])).rowCount;

  beforeAll(async () => {
    db = await createScratchDatabase();
    system = await connect(db.systemUrl);
    school = await createSchoolFixture(system);
    kernel = await createKernelTestApp(db, [BranchProbeModule]);
    tenant = kernel.app.get(TenantContext);
    commandBus = kernel.app.get(CommandBus);
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await system?.end();
    await db?.drop();
  });

  const asSchool = <T>(fn: () => Promise<T>) =>
    tenant.runInTenant({ schoolId: school.schoolId, userId: school.ownerUserId }, fn);

  it('commits the outer and inner writes in one transaction', async () => {
    const result = await asSchool(() =>
      commandBus.execute(new OpenTwoBranchesCommand('Joined', false)),
    );

    expect(result.inner).toBe(result.outer);
    expect(await branchesNamed('Joined')).toEqual(['Joined inner', 'Joined outer']);
    expect(await outboxFor('Joined inner')).toBe(1);
  });

  it("rolls back the sub-command's writes and events when the outer handler fails", async () => {
    await expect(
      asSchool(() => commandBus.execute(new OpenTwoBranchesCommand('Rolled', true))),
    ).rejects.toThrow('outer handler failed after the sub-command');

    expect(await branchesNamed('Rolled')).toEqual([]);
    expect(await outboxFor('Rolled inner')).toBe(0);
  });
});
