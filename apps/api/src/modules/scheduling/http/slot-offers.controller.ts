import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type AcceptSlotOfferRequest,
  acceptSlotOfferRequestSchema,
  type CreateSlotOfferRequest,
  createSlotOfferRequestSchema,
  type IdParams,
  idParamsSchema,
  type LessonResponse,
  type ListSlotOffersQuery as ListSlotOffersParams,
  listSlotOffersQuerySchema,
  type SlotOfferListResponse,
} from '@driveos/shared';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { CommandBus, type CommandResult, QueryBus } from '../../../kernel/cqrs/index.js';
import { Idempotent } from '../../../kernel/idempotency/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequireAnyPermission, RequirePermission } from '../../identity/index.js';
import { AcceptSlotOfferCommand } from '../commands/accept-slot-offer.command.js';
import { CreateSlotOfferCommand } from '../commands/create-slot-offer.command.js';
import { ListSlotOffersQuery } from '../queries/list-slot-offers.query.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('scheduling')
@Controller('slot-offers')
export class SlotOffersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequireAnyPermission('slot_offers.manage', 'slot_offers.accept')
  @ApiRoute({
    operationId: 'slotOffers.list',
    summary: 'Open fill-the-gap offers (offers made to the caller for students and parents)',
    status: StatusCodes.OK,
    query: 'ListSlotOffersQuery',
    response: 'SlotOfferListResponse',
  })
  list(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(listSlotOffersQuerySchema)) query: ListSlotOffersParams,
  ): Promise<SlotOfferListResponse> {
    return this.queryBus.execute(new ListSlotOffersQuery(actor, query));
  }

  @Post()
  @RequirePermission('slot_offers.manage')
  @ApiRoute({
    operationId: 'slotOffers.create',
    summary: 'Offer a free slot to matching students',
    status: StatusCodes.CREATED,
    body: 'CreateSlotOfferRequest',
    response: 'CommandResult',
  })
  create(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(createSlotOfferRequestSchema)) body: CreateSlotOfferRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new CreateSlotOfferCommand(actor, body, 'manual'));
  }

  @Post(':id/accept')
  @Idempotent()
  @RequirePermission('slot_offers.accept')
  @ApiRoute({
    operationId: 'slotOffers.accept',
    summary: 'Accept an offer; the first student to accept gets the lesson',
    status: StatusCodes.CREATED,
    params: 'IdParams',
    body: 'AcceptSlotOfferRequest',
    response: 'LessonResponse',
  })
  accept(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParams,
    @Body(new ZodValidationPipe(acceptSlotOfferRequestSchema)) body: AcceptSlotOfferRequest,
  ): Promise<LessonResponse> {
    return this.commandBus.execute(new AcceptSlotOfferCommand(actor, params.id, body));
  }
}
