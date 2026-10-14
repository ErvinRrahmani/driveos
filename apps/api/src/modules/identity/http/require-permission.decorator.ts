import { applyDecorators, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { ApiExtension, ApiForbiddenResponse } from '@nestjs/swagger';
import { schemaRef } from '../../../kernel/openapi/schemas.js';
import type { Permission, PermissionMode } from '../domain/permissions.js';

export const REQUIRED_PERMISSIONS = 'driveos:required-permissions';

export interface PermissionRequirement {
  mode: PermissionMode;
  permissions: readonly Permission[];
}

function requirePermissions(mode: PermissionMode, permissions: readonly Permission[]) {
  const requirement: PermissionRequirement = { mode, permissions };
  return applyDecorators(
    SetMetadata(REQUIRED_PERMISSIONS, requirement),
    ApiExtension('x-permissions', requirement),
    ApiForbiddenResponse({ schema: schemaRef('ErrorResponse') }),
  );
}

export const RequirePermission = (permission: Permission, ...more: Permission[]) =>
  requirePermissions('all', [permission, ...more]);

export const RequireAnyPermission = (permission: Permission, ...more: Permission[]) =>
  requirePermissions('any', [permission, ...more]);

export function requiredPermissions(
  reflector: Reflector,
  context: ExecutionContext,
): PermissionRequirement | undefined {
  return reflector.getAllAndOverride<PermissionRequirement | undefined>(REQUIRED_PERMISSIONS, [
    context.getHandler(),
    context.getClass(),
  ]);
}
