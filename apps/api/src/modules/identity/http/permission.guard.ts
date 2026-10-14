import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isPublicRoute } from '../../../kernel/auth/auth.guard.js';
import type { AuthRequest, Principal } from '../../../kernel/auth/principal.js';
import { ApiError } from '../../../kernel/http/api-error.js';
import { t } from '../../../kernel/i18n/i18n.js';
import {
  effectivePermissions,
  GLOBAL_PERMISSIONS,
  hasRequiredPermissions,
  type Permission,
  permissionsForRoles,
  SUPPORT_READ_PERMISSIONS,
} from '../domain/permissions.js';
import { PermissionGrantsCache } from '../infra/permission-grants.cache.js';
import { type PermissionRequirement, requiredPermissions } from './require-permission.decorator.js';
import { StatusCodes } from 'http-status-codes';

const SUPPORT_METHODS = new Set(['GET', 'HEAD']);

function forbidden(details: Record<string, unknown>): ApiError {
  return new ApiError(StatusCodes.FORBIDDEN, 'forbidden', t('errors.forbidden'), details);
}

function denied(requirement: PermissionRequirement, effective: ReadonlySet<Permission>): ApiError {
  if (requirement.mode === 'any') return forbidden({ anyOf: requirement.permissions });
  const missing = requirement.permissions.find((p) => !effective.has(p));
  return forbidden({ permission: missing });
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly grants: PermissionGrantsCache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http' || isPublicRoute(this.reflector, context)) return true;
    const request = context.switchToHttp().getRequest<AuthRequest & { method: string }>();
    const { principal } = request;
    if (!principal) throw new Error('PermissionGuard reached without a principal');
    const requirement = requiredPermissions(this.reflector, context);
    if (principal.tokenType === 'support') {
      this.checkSupport(principal, request.method, requirement);
      return true;
    }
    if (!requirement) return true;
    const global = requirement.permissions.every((p) => GLOBAL_PERMISSIONS.has(p));
    if (!global && !principal.schoolId) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'school_required', t('errors.school_required'));
    }
    let effective = permissionsForRoles(principal.roles);
    if (this.satisfied(requirement, effective)) return true;
    if (!global && principal.schoolId && principal.membershipId) {
      const grants = await this.grants.grants(
        principal.schoolId,
        principal.userId,
        principal.membershipId,
      );
      effective = effectivePermissions(principal.roles, grants);
      if (this.satisfied(requirement, effective)) return true;
    }
    throw denied(requirement, effective);
  }

  private checkSupport(
    principal: Principal,
    method: string,
    requirement: PermissionRequirement | undefined,
  ): void {
    if (!SUPPORT_METHODS.has(method.toUpperCase())) {
      throw forbidden({ reason: 'support_read_only' });
    }
    if (!requirement) return;
    if (!principal.schoolId)
      throw new ApiError(StatusCodes.FORBIDDEN, 'school_required', t('errors.school_required'));
    if (!this.satisfied(requirement, SUPPORT_READ_PERMISSIONS)) {
      throw denied(requirement, SUPPORT_READ_PERMISSIONS);
    }
  }

  private satisfied(requirement: PermissionRequirement, effective: ReadonlySet<Permission>) {
    return hasRequiredPermissions(effective, requirement.permissions, requirement.mode);
  }
}
