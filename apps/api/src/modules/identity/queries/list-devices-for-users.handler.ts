import { asc, inArray } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { devices } from '../infra/schema.js';
import { ListDevicesForUsersQuery, type UserDevice } from './list-devices-for-users.query.js';

@QueryHandler(ListDevicesForUsersQuery)
export class ListDevicesForUsersHandler implements IQueryHandler<
  ListDevicesForUsersQuery,
  UserDevice[]
> {
  constructor(private readonly tenant: TenantContext) {}

  async execute({ userIds }: ListDevicesForUsersQuery): Promise<UserDevice[]> {
    if (userIds.length === 0) return [];
    return this.tenant.tx
      .select({
        id: devices.id,
        userId: devices.userId,
        pushToken: devices.pushToken,
        platform: devices.platform,
        locale: devices.locale,
      })
      .from(devices)
      .where(inArray(devices.userId, [...new Set(userIds)]))
      .orderBy(asc(devices.userId), asc(devices.lastSeenAt));
  }
}
