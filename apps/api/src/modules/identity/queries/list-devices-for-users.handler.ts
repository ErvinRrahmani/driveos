import { sql } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { ListDevicesForUsersQuery, type UserDevice } from './list-devices-for-users.query.js';

interface DeviceRow extends Record<string, unknown> {
  device_id: string;
  user_id: string;
  push_token: string;
  platform: UserDevice['platform'];
  locale: string;
}

/** Postgres array literal for a bound `uuid[]` parameter. */
const pgUuidArray = (ids: readonly string[]) => `{${ids.join(',')}}`;

@QueryHandler(ListDevicesForUsersQuery)
export class ListDevicesForUsersHandler implements IQueryHandler<
  ListDevicesForUsersQuery,
  UserDevice[]
> {
  constructor(private readonly tenant: TenantContext) {}

  /**
   * Devices of the given users that are members of the current school, through the
   * `auth_devices_for_school_members` SECURITY DEFINER function (RLS shows a scope only its own
   * user's devices).
   */
  async execute({ userIds }: ListDevicesForUsersQuery): Promise<UserDevice[]> {
    if (userIds.length === 0) return [];
    const result = await this.tenant.tx.execute<DeviceRow>(
      sql`select device_id, user_id, push_token, platform, locale
            from auth_devices_for_school_members(${pgUuidArray([...new Set(userIds)])}::uuid[])`,
    );
    return result.rows.map((row) => ({
      id: row.device_id,
      userId: row.user_id,
      pushToken: row.push_token,
      platform: row.platform,
      locale: row.locale,
    }));
  }
}
