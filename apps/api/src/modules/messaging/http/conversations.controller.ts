import {
  type ConversationListResponse,
  type IdParams,
  idParamsSchema,
  type ListConversationsQuery as ListConversationsParams,
  listConversationsQuerySchema,
  type ListMessagesQuery as ListMessagesParams,
  listMessagesQuerySchema,
  type MarkConversationReadRequest,
  markConversationReadRequestSchema,
  type MarkConversationReadResponse,
  type Message,
  type MessageListResponse,
  type SendMessageRequest,
  sendMessageRequestSchema,
} from '@driveos/shared';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StatusCodes } from 'http-status-codes';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { CommandBus, QueryBus } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequireAnyPermission, RequirePermission } from '../../identity/index.js';
import { MarkConversationReadCommand } from '../commands/mark-conversation-read.command.js';
import { SendMessageCommand } from '../commands/send-message.command.js';
import { ListConversationsQuery } from '../queries/list-conversations.query.js';
import { ListMessagesQuery } from '../queries/list-messages.query.js';

@ApiTags('messaging')
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequireAnyPermission('chat.use', 'chat.read_all')
  @ApiRoute({
    operationId: 'conversations.list',
    summary: "The caller's conversations (owner and office also see instructor chats, read-only)",
    status: StatusCodes.OK,
    query: 'ListConversationsQuery',
    response: 'ConversationListResponse',
  })
  list(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(listConversationsQuerySchema)) query: ListConversationsParams,
  ): Promise<ConversationListResponse> {
    return this.queryBus.execute(new ListConversationsQuery(actor, query));
  }

  @Get(':id/messages')
  @RequireAnyPermission('chat.use', 'chat.read_all')
  @ApiRoute({
    operationId: 'messages.list',
    summary: 'Messages of a conversation, newest first',
    status: StatusCodes.OK,
    params: 'IdParams',
    query: 'ListMessagesQuery',
    response: 'MessageListResponse',
  })
  listMessages(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) { id }: IdParams,
    @Query(new ZodValidationPipe(listMessagesQuerySchema)) query: ListMessagesParams,
  ): Promise<MessageListResponse> {
    return this.queryBus.execute(new ListMessagesQuery(actor, id, query));
  }

  @Post(':id/messages')
  @RequirePermission('chat.use')
  @ApiRoute({
    operationId: 'messages.send',
    summary: 'Send a message to a conversation the caller is a member of',
    status: StatusCodes.CREATED,
    params: 'IdParams',
    body: 'SendMessageRequest',
    response: 'Message',
  })
  send(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) { id }: IdParams,
    @Body(new ZodValidationPipe(sendMessageRequestSchema)) body: SendMessageRequest,
  ): Promise<Message> {
    return this.commandBus.execute(new SendMessageCommand(actor, id, body));
  }

  @Post(':id/read')
  @RequirePermission('chat.use')
  @ApiRoute({
    operationId: 'conversations.markRead',
    summary: 'Mark a conversation as read up to a message',
    status: StatusCodes.OK,
    params: 'IdParams',
    body: 'MarkConversationReadRequest',
    response: 'MarkConversationReadResponse',
  })
  markRead(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) { id }: IdParams,
    @Body(new ZodValidationPipe(markConversationReadRequestSchema))
    body: MarkConversationReadRequest,
  ): Promise<MarkConversationReadResponse> {
    return this.commandBus.execute(new MarkConversationReadCommand(actor, id, body));
  }
}
