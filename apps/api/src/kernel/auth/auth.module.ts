import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import type { Env } from '../config/env.js';
import { AccessTokenService } from './access-token.js';
import { AuthGuard } from './auth.guard.js';
import { AUTHENTICATORS, type Authenticator } from './authenticator.js';
import { BearerAuthenticator } from './bearer.authenticator.js';
import { DevHeaderAuthenticator } from './dev-auth.authenticator.js';

export function authenticatorsFor(
  nodeEnv: Env['NODE_ENV'],
  tokens: AccessTokenService,
): Authenticator[] {
  const bearer = new BearerAuthenticator(tokens);
  return nodeEnv === 'test' ? [bearer, new DevHeaderAuthenticator()] : [bearer];
}

@Global()
@Module({
  providers: [
    {
      provide: AccessTokenService,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new AccessTokenService({
          secret: config.get('AUTH_JWT_SECRET', { infer: true }),
          ttlSeconds: config.get('AUTH_ACCESS_TTL_SECONDS', { infer: true }),
        }),
    },
    {
      provide: AUTHENTICATORS,
      inject: [ConfigService, AccessTokenService],
      useFactory: (config: ConfigService<Env, true>, tokens: AccessTokenService) =>
        authenticatorsFor(config.get('NODE_ENV', { infer: true }), tokens),
    },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AccessTokenService],
})
export class AuthModule {}
