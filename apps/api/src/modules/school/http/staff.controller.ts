import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequirePermission } from '../../identity/index.js';
import { QueryBus } from '@nestjs/cqrs';
import {
  type ListStaffQuery as ListStaffParams,
  listStaffQuerySchema,
  type StaffListResponse,
} from '@driveos/shared';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ListStaffQuery } from '../queries/list-staff.query.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('school')
@Controller('staff')
export class StaffController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @RequirePermission('staff.read')
  @ApiRoute({
    operationId: 'staff.list',
    summary: "The school's owners, office staff and instructors",
    status: StatusCodes.OK,
    query: 'ListStaffQuery',
    response: 'StaffListResponse',
  })
  list(
    @Query(new ZodValidationPipe(listStaffQuerySchema)) query: ListStaffParams,
  ): Promise<StaffListResponse> {
    return this.queryBus.execute(new ListStaffQuery(query));
  }
}
