import { sql } from 'drizzle-orm';
import { CommandHandler, type ICommandHandler } from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { AuthDirectory } from '../infra/auth-directory.js';
import { devices } from '../infra/schema.js';
import { RegisterDeviceCommand, type RegisteredDevice } from './register-device.command.js';

@CommandHandler(RegisterDeviceCommand)
export class RegisterDeviceHandler implements ICommandHandler<
  RegisterDeviceCommand,
  RegisteredDevice
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly directory: AuthDirectory,
  ) {}

  async execute(command: RegisterDeviceCommand): Promise<RegisteredDevice> {
    await this.directory.releasePushToken(command.pushToken);
    const now = new Date();
    const [row] = await this.tenant.tx
      .insert(devices)
      .values({
        id: newId(),
        userId: command.userId,
        platform: command.platform,
        pushToken: command.pushToken,
        locale: command.locale,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: devices.pushToken,
        set: {
          platform: sql`excluded.platform`,
          locale: sql`excluded.locale`,
          lastSeenAt: sql`excluded.last_seen_at`,
          updatedAt: now,
        },
      })
      .returning({ id: devices.id });
    if (!row) throw new Error('device upsert returned no row');
    return { id: row.id };
  }
}
