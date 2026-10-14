import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import { Module } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import {
  Command,
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
  type IQueryHandler,
  newEvent,
  Query,
  QueryHandler,
} from '../../src/kernel/cqrs/index.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { newId } from '../../src/kernel/db/columns.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { PingModule, PingRecorded, RecordPingCommand } from '../fixtures/ping/index.js';
import { expectEventAppended, expectNoEvent } from '../support/events.js';
import { executeAs } from '../support/handlers.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import { createTestTenants, type TestTenants } from '../support/tenants.js';

class AppendThenFailCommand extends Command<CommandResult> {
  constructor(readonly aggregateId: string) {
    super();
  }
}

@CommandHandler(AppendThenFailCommand)
class AppendThenFailHandler implements ICommandHandler<AppendThenFailCommand, CommandResult> {
  constructor(private readonly events: EventPublisher) {}

  async execute(command: AppendThenFailCommand): Promise<CommandResult> {
    await this.events.append([
      newEvent(PingRecorded, {
        aggregateType: 'ping',
        aggregateId: command.aggregateId,
        aggregateVersion: 1,
        payload: { message: 'doomed' },
      }),
    ]);
    throw new Error('handler failed');
  }
}

interface TenantSettings {
  schoolId: string | null;
  userId: string | null;
}

class GetTenantSettingsQuery extends Query<TenantSettings> {}

@QueryHandler(GetTenantSettingsQuery)
class GetTenantSettingsHandler implements IQueryHandler<GetTenantSettingsQuery, TenantSettings> {
  constructor(private readonly tenant: TenantContext) {}

  async execute(): Promise<TenantSettings> {
    const result = await this.tenant.tx.execute<{ school_id: string; user_id: string }>(
      sql`select current_setting('app.school_id', true) as school_id,
        current_setting('app.user_id', true) as user_id`,
    );
    const row = result.rows[0];
    return { schoolId: row?.school_id || null, userId: row?.user_id || null };
  }
}

@Module({ providers: [AppendThenFailHandler, GetTenantSettingsHandler] })
class AppendThenFailModule {}

describe('executeAs', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let tenants: TestTenants;

  beforeAll(async () => {
    db = await createScratchDatabase();
    tenants = await createTestTenants(db);
    kernel = await createKernelTestApp(db, [PingModule, AppendThenFailModule]);
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await tenants?.close();
    await db?.drop();
  });

  it('runs a command through the CommandBus inside the tenant transaction', async () => {
    const result = await executeAs(kernel.app, tenants.A, new RecordPingCommand('hi'));

    expectTypeOf(result).toEqualTypeOf<CommandResult>();
    expect(result).toEqual({ id: expect.any(String), version: 1 });
    const event = await expectEventAppended(db, { type: PingRecorded, aggregateId: result.id });
    expect(event).toMatchObject({
      schoolId: tenants.A.schoolId,
      actorUserId: tenants.A.ownerUserId,
      payload: { message: 'hi' },
    });
  });

  it('runs a query through the QueryBus as the given tenant', async () => {
    const asA = await executeAs(kernel.app, tenants.A, new GetTenantSettingsQuery());
    const asB = await executeAs(kernel.app, tenants.B, new GetTenantSettingsQuery());

    expect(asA).toEqual({ schoolId: tenants.A.schoolId, userId: tenants.A.ownerUserId });
    expect(asB).toEqual({ schoolId: tenants.B.schoolId, userId: tenants.B.ownerUserId });
  });

  it('accepts an explicit { schoolId, userId } tenant, including no school', async () => {
    const result = await executeAs(
      kernel.app,
      { schoolId: null, userId: tenants.B.ownerUserId },
      new GetTenantSettingsQuery(),
    );

    expect(result).toEqual({ schoolId: null, userId: tenants.B.ownerUserId });
  });

  it('rolls back the transaction when the handler fails after appending', async () => {
    const aggregateId = newId();

    await expect(
      executeAs(kernel.app, tenants.A, new AppendThenFailCommand(aggregateId)),
    ).rejects.toThrow('handler failed');
    await expectNoEvent(db, { type: PingRecorded, aggregateId });
  });

  it('rejects messages that are neither a Command nor a Query', async () => {
    await expect(executeAs(kernel.app, tenants.A, { message: 'x' } as never)).rejects.toThrow(
      /Command or Query/,
    );
  });
});
