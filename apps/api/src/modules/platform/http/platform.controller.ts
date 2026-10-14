import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequirePermission } from '../../identity/index.js';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  type CreatePlanRequest,
  createPlanRequestSchema,
  type CreateSchoolRequest,
  createSchoolRequestSchema,
  type CreateSchoolResponse,
  type IdParams,
  idParamsSchema,
  type ImportQuestionPackRequest,
  importQuestionPackRequestSchema,
  type ImportQuestionPackResponse,
  type ListPlansQuery as ListPlansParams,
  listPlansQuerySchema,
  type ListPlatformStatementsQuery as ListPlatformStatementsParams,
  listPlatformStatementsQuerySchema,
  type MarkStatementPaidRequest,
  markStatementPaidRequestSchema,
  type PlanListResponse,
  type PlatformAlertListResponse,
  type PlatformStatementListResponse,
  type StartSupportSessionRequest,
  startSupportSessionRequestSchema,
  type StartSupportSessionResponse,
  type UpdatePlanRequest,
  updatePlanRequestSchema,
} from '@driveos/shared';
import { ConfigService } from '@nestjs/config';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import type { Env } from '../../../kernel/config/env.js';
import type { CommandResult } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ListPlatformStatementsQuery, MarkStatementPaidCommand } from '../../billing/index.js';
import { ImportQuestionPackCommand, PublishQuestionPackCommand } from '../../theory/index.js';
import { CreatePlanCommand } from '../commands/create-plan.command.js';
import { CreateSchoolCommand } from '../commands/create-school.command.js';
import { EndSupportSessionCommand } from '../commands/end-support-session.command.js';
import { StartSupportSessionCommand } from '../commands/start-support-session.command.js';
import { UpdatePlanCommand } from '../commands/update-plan.command.js';
import { GetPlatformAlertsQuery } from '../queries/get-platform-alerts.query.js';
import { ListPlansQuery } from '../queries/list-plans.query.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('platform')
@RequirePermission('platform.manage')
@Controller('platform')
export class PlatformController {
  private readonly exposeAcceptToken: boolean;

  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    config: ConfigService<Env, true>,
  ) {
    this.exposeAcceptToken = config.get('NODE_ENV', { infer: true }) !== 'production';
  }

  @Post('schools')
  @ApiRoute({
    operationId: 'platformSchools.create',
    summary: 'Onboard a school with its first owner and plan',
    status: StatusCodes.CREATED,
    body: 'CreateSchoolRequest',
    response: 'CreateSchoolResponse',
  })
  async createSchool(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(createSchoolRequestSchema)) body: CreateSchoolRequest,
  ): Promise<CreateSchoolResponse> {
    const { acceptToken, ...created } = await this.commandBus.execute(
      new CreateSchoolCommand(actor, body),
    );
    return this.exposeAcceptToken ? { ...created, acceptToken } : created;
  }

  @Get('plans')
  @ApiRoute({
    operationId: 'plans.list',
    summary: 'Subscription plans',
    status: StatusCodes.OK,
    query: 'ListPlansQuery',
    response: 'PlanListResponse',
  })
  listPlans(
    @Query(new ZodValidationPipe(listPlansQuerySchema)) query: ListPlansParams,
  ): Promise<PlanListResponse> {
    return this.queryBus.execute(new ListPlansQuery(query));
  }

  @Post('plans')
  @ApiRoute({
    operationId: 'plans.create',
    summary: 'Add a subscription plan',
    status: StatusCodes.CREATED,
    body: 'CreatePlanRequest',
    response: 'CommandResult',
  })
  createPlan(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(createPlanRequestSchema)) body: CreatePlanRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new CreatePlanCommand(actor, body));
  }

  @Patch('plans/:id')
  @ApiRoute({
    operationId: 'plans.update',
    summary: 'Change a subscription plan',
    status: StatusCodes.OK,
    params: 'IdParams',
    body: 'UpdatePlanRequest',
    response: 'CommandResult',
  })
  updatePlan(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParams,
    @Body(new ZodValidationPipe(updatePlanRequestSchema)) body: UpdatePlanRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new UpdatePlanCommand(actor, params.id, body));
  }

  @Get('alerts')
  @ApiRoute({
    operationId: 'platformAlerts.list',
    summary:
      'Operational alerts currently firing (dead letters, outbox lag, webhook failures, sync backlog)',
    status: StatusCodes.OK,
    response: 'PlatformAlertListResponse',
  })
  listAlerts(): Promise<PlatformAlertListResponse> {
    return this.queryBus.execute(new GetPlatformAlertsQuery());
  }

  @Get('statements')
  @ApiRoute({
    operationId: 'platformStatements.listAll',
    summary: 'Monthly platform statements of all schools',
    status: StatusCodes.OK,
    query: 'ListPlatformStatementsQuery',
    response: 'PlatformStatementListResponse',
  })
  listStatements(
    @Query(new ZodValidationPipe(listPlatformStatementsQuerySchema))
    query: ListPlatformStatementsParams,
  ): Promise<PlatformStatementListResponse> {
    return this.queryBus.execute(new ListPlatformStatementsQuery(query));
  }

  @Post('statements/:id/mark-paid')
  @ApiRoute({
    operationId: 'platformStatements.markPaid',
    summary: 'Record the payment of a platform statement (bank transfer or cash)',
    status: StatusCodes.OK,
    params: 'IdParams',
    body: 'MarkStatementPaidRequest',
    response: 'CommandResult',
  })
  markStatementPaid(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParams,
    @Body(new ZodValidationPipe(markStatementPaidRequestSchema)) body: MarkStatementPaidRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new MarkStatementPaidCommand(actor, params.id, body));
  }

  @Post('question-packs/import')
  @ApiRoute({
    operationId: 'questionPacks.import',
    summary: 'Import a theory question pack as a draft',
    status: StatusCodes.CREATED,
    body: 'ImportQuestionPackRequest',
    response: 'ImportQuestionPackResponse',
  })
  importQuestionPack(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(importQuestionPackRequestSchema)) body: ImportQuestionPackRequest,
  ): Promise<ImportQuestionPackResponse> {
    return this.commandBus.execute(new ImportQuestionPackCommand(actor, body));
  }

  @Post('question-packs/:id/publish')
  @ApiRoute({
    operationId: 'questionPacks.publish',
    summary: 'Publish an imported question pack',
    status: StatusCodes.OK,
    params: 'IdParams',
    response: 'CommandResult',
  })
  publishQuestionPack(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParams,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new PublishQuestionPackCommand(actor, params.id));
  }

  @Post('support-sessions')
  @ApiRoute({
    operationId: 'supportSessions.start',
    summary: 'Start a time-boxed, audited, read-only support session in one school',
    status: StatusCodes.CREATED,
    body: 'StartSupportSessionRequest',
    response: 'StartSupportSessionResponse',
  })
  startSupportSession(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(startSupportSessionRequestSchema)) body: StartSupportSessionRequest,
  ): Promise<StartSupportSessionResponse> {
    return this.commandBus.execute(new StartSupportSessionCommand(actor, body));
  }

  @Post('support-sessions/:id/end')
  @ApiRoute({
    operationId: 'supportSessions.end',
    summary: 'End a support session',
    status: StatusCodes.OK,
    params: 'IdParams',
    response: 'CommandResult',
  })
  endSupportSession(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParams,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new EndSupportSessionCommand(actor, params.id));
  }
}
