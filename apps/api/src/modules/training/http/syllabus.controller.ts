import { type SyllabusQuery, syllabusQuerySchema, type SyllabusResponse } from '@driveos/shared';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequirePermission } from '../../identity/index.js';
import { GetSyllabusQuery } from '../queries/get-syllabus.query.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('training')
@Controller('syllabus')
export class SyllabusController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @RequirePermission('syllabus.read')
  @ApiRoute({
    operationId: 'syllabus.list',
    summary: 'Syllabus items for a licence class',
    status: StatusCodes.OK,
    query: 'SyllabusQuery',
    response: 'SyllabusResponse',
  })
  list(
    @Query(new ZodValidationPipe(syllabusQuerySchema)) query: SyllabusQuery,
  ): Promise<SyllabusResponse> {
    return this.queryBus.execute(new GetSyllabusQuery(query));
  }
}
