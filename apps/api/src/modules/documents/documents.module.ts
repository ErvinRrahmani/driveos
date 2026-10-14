import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { PlatformModule } from '../platform/platform.module.js';
import { CompleteDocumentUploadHandler } from './commands/complete-document-upload.handler.js';
import { CreateContractTemplateHandler } from './commands/create-contract-template.handler.js';
import { CreateContractHandler } from './commands/create-contract.handler.js';
import { CreateUploadUrlHandler } from './commands/create-upload-url.handler.js';
import { SignContractHandler } from './commands/sign-contract.handler.js';
import { ContractTemplatesController } from './http/contract-templates.controller.js';
import { ContractsController } from './http/contracts.controller.js';
import { DocumentsController } from './http/documents.controller.js';
import { ContractViews } from './infra/contract-views.js';
import { DocumentAccess } from './infra/document-access.js';
import { People } from './infra/people.js';
import { GetContractHandler } from './queries/get-contract.handler.js';
import { GetDocumentDownloadUrlHandler } from './queries/get-document-download-url.handler.js';
import { ListContractTemplatesHandler } from './queries/list-contract-templates.handler.js';
import { ListContractsHandler } from './queries/list-contracts.handler.js';
import { ListDocumentsHandler } from './queries/list-documents.handler.js';

@Module({
  imports: [PlatformModule, IdentityModule],
  controllers: [DocumentsController, ContractTemplatesController, ContractsController],
  providers: [
    DocumentAccess,
    People,
    ContractViews,
    CreateUploadUrlHandler,
    CompleteDocumentUploadHandler,
    ListDocumentsHandler,
    GetDocumentDownloadUrlHandler,
    CreateContractTemplateHandler,
    ListContractTemplatesHandler,
    CreateContractHandler,
    GetContractHandler,
    SignContractHandler,
    ListContractsHandler,
  ],
})
export class DocumentsModule {}
