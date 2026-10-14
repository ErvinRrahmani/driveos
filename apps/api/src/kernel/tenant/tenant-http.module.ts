import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TenantInterceptor } from './tenant.interceptor.js';

@Module({
  providers: [{ provide: APP_INTERCEPTOR, useClass: TenantInterceptor }],
})
export class TenantHttpModule {}
