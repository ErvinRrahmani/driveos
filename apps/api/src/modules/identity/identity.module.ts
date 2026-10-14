import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AcceptInvitationHandler } from './commands/accept-invitation.handler.js';
import { CreateInvitationHandler } from './commands/create-invitation.handler.js';
import { InviteOwnerHandler } from './commands/invite-owner.handler.js';
import { RefreshSessionHandler } from './commands/refresh-session.handler.js';
import { RegisterDeviceHandler } from './commands/register-device.handler.js';
import { RequestLoginCodeHandler } from './commands/request-login-code.handler.js';
import { RevokeSessionHandler } from './commands/revoke-session.handler.js';
import { SwitchSchoolHandler } from './commands/switch-school.handler.js';
import { UpdateMembershipHandler } from './commands/update-membership.handler.js';
import { VerifyLoginCodeHandler } from './commands/verify-login-code.handler.js';
import { AuthController } from './http/auth.controller.js';
import { DevicesController } from './http/devices.controller.js';
import { InvitationsController } from './http/invitations.controller.js';
import { MeController } from './http/me.controller.js';
import { MembershipsController } from './http/memberships.controller.js';
import { PermissionGuard } from './http/permission.guard.js';
import { AuthDirectory } from './infra/auth-directory.js';
import { IdentitySettings } from './infra/identity-settings.js';
import { InvitationIssuer } from './infra/invitation-issuer.js';
import { InvitationsRepository } from './infra/invitations.repository.js';
import { LoginCodeNotifier } from './infra/login-code-notifier.js';
import { LoginRateLimiter } from './infra/login-rate-limiter.js';
import { MembershipDirectory } from './infra/membership-directory.js';
import { AnonymizeUserHandler } from './commands/anonymize-user.handler.js';
import { MembershipsRepository } from './infra/memberships.repository.js';
import { OtpCodesRepository } from './infra/otp-codes.repository.js';
import { PermissionGrantsCache } from './infra/permission-grants.cache.js';
import { RefreshGraceCache } from './infra/refresh-grace-cache.js';
import { RefreshTokensRepository } from './infra/refresh-tokens.repository.js';
import { SessionIssuer } from './infra/session-issuer.js';
import { GetMeHandler } from './queries/get-me.handler.js';
import { ListDevicesForUsersHandler } from './queries/list-devices-for-users.handler.js';
import { ListInvitationsHandler } from './queries/list-invitations.handler.js';

@Module({
  controllers: [
    AuthController,
    MeController,
    DevicesController,
    InvitationsController,
    MembershipsController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: PermissionGuard },
    PermissionGrantsCache,
    IdentitySettings,
    AuthDirectory,
    OtpCodesRepository,
    RefreshTokensRepository,
    InvitationsRepository,
    MembershipsRepository,
    MembershipDirectory,
    LoginRateLimiter,
    RefreshGraceCache,
    LoginCodeNotifier,
    SessionIssuer,
    RequestLoginCodeHandler,
    VerifyLoginCodeHandler,
    RefreshSessionHandler,
    RevokeSessionHandler,
    SwitchSchoolHandler,
    RegisterDeviceHandler,
    InvitationIssuer,
    CreateInvitationHandler,
    InviteOwnerHandler,
    AcceptInvitationHandler,
    UpdateMembershipHandler,
    AnonymizeUserHandler,
    GetMeHandler,
    ListInvitationsHandler,
    ListDevicesForUsersHandler,
  ],
  exports: [MembershipDirectory],
})
export class IdentityModule {}
