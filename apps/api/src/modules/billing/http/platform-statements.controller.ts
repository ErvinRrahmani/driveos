import {
  type ListSchoolPlatformStatementsQuery as ListSchoolPlatformStatementsParams,
  listSchoolPlatformStatementsQuerySchema,
  type PlatformStatementListResponse,
} from '@driveos/shared';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequirePermission } from '../../identity/index.js';
import { ListSchoolPlatformStatementsQuery } from '../queries/list-school-platform-statements.query.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('billing')
@Controller('platform-statements')
export class PlatformStatementsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @RequirePermission('platform_statements.read')
  @ApiRoute({
    operationId: 'platformStatements.list',
    summary: "The school's own monthly DriveOS statements",
    status: StatusCodes.OK,
    query: 'ListSchoolPlatformStatementsQuery',
    response: 'PlatformStatementListResponse',
  })
  list(
    @Query(new ZodValidationPipe(listSchoolPlatformStatementsQuerySchema))
    query: ListSchoolPlatformStatementsParams,
  ): Promise<PlatformStatementListResponse> {
    return this.queryBus.execute(new ListSchoolPlatformStatementsQuery(query));
  }
}
