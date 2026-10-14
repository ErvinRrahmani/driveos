import type { INestApplicationContext } from '@nestjs/common';
import { Command, CommandBus, Query, QueryBus } from '../../src/kernel/cqrs/index.js';
import { type Tenant, TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import type { TestTenant } from './tenants.js';

export type ExecuteTenant = TestTenant | Tenant;

function toTenant(as: ExecuteTenant): Tenant {
  return 'ownerUserId' in as ? { schoolId: as.schoolId, userId: as.ownerUserId } : as;
}

export async function executeAs<R>(
  app: INestApplicationContext,
  as: ExecuteTenant,
  message: Command<R> | Query<R>,
): Promise<R> {
  const tenant = app.get(TenantContext);
  if (message instanceof Command) {
    const bus = app.get(CommandBus);
    return tenant.runInTenant(toTenant(as), () => bus.execute(message));
  }
  if (message instanceof Query) {
    const bus = app.get(QueryBus);
    return tenant.runInTenant(toTenant(as), () => bus.execute(message));
  }
  throw new Error('executeAs needs an instance of a Command or Query subclass');
}
