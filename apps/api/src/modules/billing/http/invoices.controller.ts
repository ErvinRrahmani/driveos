import {
  type InvoiceListResponse,
  type InvoicePdfParams,
  invoicePdfParamsSchema,
  type ListInvoicesQuery as ListInvoicesParams,
  listInvoicesQuerySchema,
} from '@driveos/shared';
import { Controller, Get, Param, Query, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequireAnyPermission } from '../../identity/index.js';
import { GetInvoicePdfQuery } from '../queries/get-invoice-pdf.query.js';
import { ListInvoicesQuery } from '../queries/list-invoices.query.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('billing')
@RequireAnyPermission('invoices.read', 'invoices.read.own')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiRoute({
    operationId: 'invoices.list',
    summary: 'Invoices and credit notes',
    status: StatusCodes.OK,
    query: 'ListInvoicesQuery',
    response: 'InvoiceListResponse',
  })
  list(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(listInvoicesQuerySchema)) query: ListInvoicesParams,
  ): Promise<InvoiceListResponse> {
    return this.queryBus.execute(new ListInvoicesQuery(actor, query));
  }

  @Get(':id.pdf')
  @ApiRoute({
    operationId: 'invoices.pdf',
    summary: 'An invoice or credit note as PDF',
    status: StatusCodes.OK,
    params: 'InvoicePdfParams',
    produces: 'application/pdf',
  })
  async pdf(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(invoicePdfParamsSchema)) params: InvoicePdfParams,
  ): Promise<StreamableFile> {
    const pdf = await this.queryBus.execute(new GetInvoicePdfQuery(actor, params.id));
    return new StreamableFile(Buffer.from(pdf.body), {
      type: pdf.contentType,
      disposition: `attachment; filename="${pdf.fileName}"`,
      length: pdf.body.byteLength,
    });
  }
}
