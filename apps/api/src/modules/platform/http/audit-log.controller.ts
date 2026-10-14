import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequirePermission } from '../../identity/index.js';
import { QueryBus } from '@nestjs/cqrs';
import {
  type AuditLogListResponse,
  type ListAuditLogQuery as ListAuditLogParams,
  listAuditLogQuerySchema,
} from '@driveos/shared';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ListAuditLogQuery } from '../queries/list-audit-log.query.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('platform')
@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @RequirePermission('audit_log.read')
  @ApiRoute({
    operationId: 'auditLog.list',
    summary: "The school's audit log, newest first",
    status: StatusCodes.OK,
    query: 'ListAuditLogQuery',
    response: 'AuditLogListResponse',
  })
  list(
    @Query(new ZodValidationPipe(listAuditLogQuerySchema)) query: ListAuditLogParams,
  ): Promise<AuditLogListResponse> {
    return this.queryBus.execute(new ListAuditLogQuery(query));
  }
}
