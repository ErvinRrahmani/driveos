import {
  type CreateUploadUrlRequest,
  createUploadUrlRequestSchema,
  type CreateUploadUrlResponse,
  type DocumentDownloadUrlResponse,
  type DocumentListResponse,
  type IdParams,
  idParamsSchema,
  type ListDocumentsQuery as ListDocumentsParams,
  listDocumentsQuerySchema,
} from '@driveos/shared';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StatusCodes } from 'http-status-codes';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { CommandBus, type CommandResult, QueryBus } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequireAnyPermission, RequirePermission } from '../../identity/index.js';
import { CompleteDocumentUploadCommand } from '../commands/complete-document-upload.command.js';
import { CreateUploadUrlCommand } from '../commands/create-upload-url.command.js';
import { GetDocumentDownloadUrlQuery } from '../queries/get-document-download-url.query.js';
import { ListDocumentsQuery } from '../queries/list-documents.query.js';

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('upload-url')
  @RequirePermission('documents.upload')
  @ApiRoute({
    operationId: 'documents.createUploadUrl',
    summary: 'A short-lived signed URL to upload a document to encrypted storage',
    status: StatusCodes.CREATED,
    body: 'CreateUploadUrlRequest',
    response: 'CreateUploadUrlResponse',
  })
  createUploadUrl(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(createUploadUrlRequestSchema)) body: CreateUploadUrlRequest,
  ): Promise<CreateUploadUrlResponse> {
    return this.commandBus.execute(new CreateUploadUrlCommand(actor, body));
  }

  @Post(':id/complete')
  @RequirePermission('documents.upload')
  @ApiRoute({
    operationId: 'documents.completeUpload',
    summary: 'Confirm that an upload finished',
    status: StatusCodes.OK,
    params: 'IdParams',
    response: 'CommandResult',
  })
  completeUpload(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) { id }: IdParams,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new CompleteDocumentUploadCommand(actor, id));
  }

  @Get()
  @RequireAnyPermission('documents.read', 'documents.read.own')
  @ApiRoute({
    operationId: 'documents.list',
    summary: 'Documents (own or linked students for students and parents)',
    status: StatusCodes.OK,
    query: 'ListDocumentsQuery',
    response: 'DocumentListResponse',
  })
  list(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(listDocumentsQuerySchema)) query: ListDocumentsParams,
  ): Promise<DocumentListResponse> {
    return this.queryBus.execute(new ListDocumentsQuery(actor, query));
  }

  @Get(':id/download-url')
  @RequireAnyPermission('documents.read', 'documents.read.own')
  @ApiRoute({
    operationId: 'documents.downloadUrl',
    summary: 'A short-lived signed URL to download a document (audited for staff)',
    status: StatusCodes.OK,
    params: 'IdParams',
    response: 'DocumentDownloadUrlResponse',
  })
  downloadUrl(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) { id }: IdParams,
  ): Promise<DocumentDownloadUrlResponse> {
    return this.queryBus.execute(new GetDocumentDownloadUrlQuery(actor, id));
  }
}
