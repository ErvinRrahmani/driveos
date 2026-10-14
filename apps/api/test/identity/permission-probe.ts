import { Controller, Get, HttpCode, Module, Post } from '@nestjs/common';
import type { Permission } from '../../src/modules/identity/domain/permissions.js';
import {
  RequireAnyPermission,
  RequirePermission,
} from '../../src/modules/identity/http/require-permission.decorator.js';
import { StatusCodes } from 'http-status-codes';

export interface ProbeRoute {
  method: 'GET' | 'POST';
  path: string;
  permission: Permission;
}

export const PROBE_ROUTES: ProbeRoute[] = [
  { method: 'POST', path: '/v1/probe/invitations', permission: 'invitations.manage' },
  { method: 'GET', path: '/v1/probe/students-own', permission: 'students.read.own' },
  { method: 'POST', path: '/v1/probe/theory', permission: 'theory.use' },
  { method: 'POST', path: '/v1/probe/consent', permission: 'consent.give' },
  { method: 'GET', path: '/v1/probe/calendar', permission: 'calendar.read' },
  { method: 'GET', path: '/v1/probe/private-notes', permission: 'private_notes.read' },
  { method: 'POST', path: '/v1/probe/lessons', permission: 'lessons.create' },
  { method: 'GET', path: '/v1/probe/prices', permission: 'prices.manage' },
  { method: 'GET', path: '/v1/probe/platform', permission: 'platform.manage' },
];

@Controller('probe')
class PermissionProbeController {
  @Get('open')
  openRead(): { ok: true } {
    return { ok: true };
  }

  @Post('open')
  @HttpCode(StatusCodes.OK)
  openWrite(): { ok: true } {
    return { ok: true };
  }

  @Get('any')
  @RequireAnyPermission('students.read', 'progress.write.own')
  any(): { ok: true } {
    return { ok: true };
  }

  @Post('invitations')
  @HttpCode(StatusCodes.OK)
  @RequirePermission('invitations.manage')
  invitations(): { ok: true } {
    return { ok: true };
  }

  @Get('students-own')
  @RequirePermission('students.read.own')
  studentsOwn(): { ok: true } {
    return { ok: true };
  }

  @Post('theory')
  @HttpCode(StatusCodes.OK)
  @RequirePermission('theory.use')
  theory(): { ok: true } {
    return { ok: true };
  }

  @Post('consent')
  @HttpCode(StatusCodes.OK)
  @RequirePermission('consent.give')
  consent(): { ok: true } {
    return { ok: true };
  }

  @Get('calendar')
  @RequirePermission('calendar.read')
  calendar(): { ok: true } {
    return { ok: true };
  }

  @Get('private-notes')
  @RequirePermission('private_notes.read')
  privateNotes(): { ok: true } {
    return { ok: true };
  }

  @Post('lessons')
  @HttpCode(StatusCodes.OK)
  @RequirePermission('lessons.create')
  lessons(): { ok: true } {
    return { ok: true };
  }

  @Get('prices')
  @RequirePermission('prices.manage')
  prices(): { ok: true } {
    return { ok: true };
  }

  @Get('platform')
  @RequirePermission('platform.manage')
  platform(): { ok: true } {
    return { ok: true };
  }
}

@Module({ controllers: [PermissionProbeController] })
export class PermissionProbeModule {}
