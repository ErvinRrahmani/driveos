import { Module } from '@nestjs/common';
import { MembershipDirectory } from './infra/membership-directory.js';
import { MembershipsRepository } from './infra/memberships.repository.js';
import { PermissionGrantsCache } from './infra/permission-grants.cache.js';
import { ListDevicesForUsersHandler } from './queries/list-devices-for-users.handler.js';
import { DeviceTokenInvalidatedSubscriber } from './subscribers/device-token-invalidated.subscriber.js';
import { GuardianConsentGivenSubscriber } from './subscribers/guardian-consent-given.subscriber.js';
import { PermissionCacheSubscriber } from './subscribers/permission-cache.subscriber.js';

@Module({
  providers: [
    MembershipDirectory,
    MembershipsRepository,
    PermissionGrantsCache,
    GuardianConsentGivenSubscriber,
    DeviceTokenInvalidatedSubscriber,
    PermissionCacheSubscriber,
    ListDevicesForUsersHandler,
  ],
  exports: [MembershipDirectory],
})
export class IdentityWorkerModule {}
