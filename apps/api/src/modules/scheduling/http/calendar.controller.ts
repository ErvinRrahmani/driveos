import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type CalendarQuery,
  calendarQuerySchema,
  type CalendarResponse,
  type FreeSlotsQuery,
  freeSlotsQuerySchema,
  type FreeSlotsResponse,
} from '@driveos/shared';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequireAnyPermission } from '../../identity/index.js';
import { GetCalendarQuery } from '../queries/get-calendar.query.js';
import { ListFreeSlotsQuery } from '../queries/list-free-slots.query.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('scheduling')
@Controller('calendar')
export class CalendarController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @RequireAnyPermission('calendar.read', 'calendar.read.own', 'lessons.read.own')
  @ApiRoute({
    operationId: 'calendar.get',
    summary: 'Lessons in a time range, filtered by instructor, vehicle or student',
    status: StatusCodes.OK,
    query: 'CalendarQuery',
    response: 'CalendarResponse',
  })
  get(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(calendarQuerySchema)) query: CalendarQuery,
  ): Promise<CalendarResponse> {
    return this.queryBus.execute(new GetCalendarQuery(actor, query));
  }

  @Get('free-slots')
  @RequireAnyPermission(
    'calendar.read',
    'calendar.read.own',
    'lessons.create',
    'lessons.create.own',
  )
  @ApiRoute({
    operationId: 'calendar.freeSlots',
    summary: 'Bookable slots for a lesson type',
    status: StatusCodes.OK,
    query: 'FreeSlotsQuery',
    response: 'FreeSlotsResponse',
  })
  freeSlots(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(freeSlotsQuerySchema)) query: FreeSlotsQuery,
  ): Promise<FreeSlotsResponse> {
    return this.queryBus.execute(new ListFreeSlotsQuery(actor, query));
  }
}
