import type { CreateUploadUrlResponse } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { OBJECT_STORAGE, type ObjectStorage } from '../../../adapters/storage/object-storage.js';
import { CommandHandler, type ICommandHandler } from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { invalidField, notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { resolveUploadOwner, storageKeyFor } from '../domain/document-access.js';
import { DocumentAccess } from '../infra/document-access.js';
import { forbidden } from '../infra/documents-errors.js';
import { documents } from '../infra/schema.js';
import { CreateUploadUrlCommand } from './create-upload-url.command.js';

export const UPLOAD_URL_TTL_SECONDS = 15 * 60;

@CommandHandler(CreateUploadUrlCommand)
export class CreateUploadUrlHandler implements ICommandHandler<
  CreateUploadUrlCommand,
  CreateUploadUrlResponse
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly access: DocumentAccess,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async execute({ actor, body }: CreateUploadUrlCommand): Promise<CreateUploadUrlResponse> {
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('Uploads need a school scope');
    const viewer = await this.access.documents(actor);
    const owner = resolveUploadOwner({
      scope: viewer.scope,
      ownStudentId: viewer.ownStudentId,
      requested: body.ownerStudentId,
    });
    if (!owner.ok) {
      if (owner.reason === 'student_required') {
        throw invalidField(['ownerStudentId'], 'Choose a student');
      }
      throw forbidden();
    }
    if (owner.ownerStudentId && !(await this.access.studentExists(owner.ownerStudentId))) {
      throw notFound();
    }
    const id = newId();
    const storageKey = storageKeyFor(schoolId, id);
    await this.tenant.tx.insert(documents).values({
      id,
      schoolId,
      ownerStudentId: owner.ownerStudentId,
      kind: body.kind,
      storageKey,
      mime: body.mime,
      sizeBytes: body.sizeBytes,
      uploadedBy: actor.userId,
      status: 'pending',
    });
    const upload = await this.storage.presignUpload({
      key: storageKey,
      mime: body.mime,
      sizeBytes: body.sizeBytes,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    });
    return {
      documentId: id,
      uploadUrl: upload.url,
      method: 'PUT',
      headers: upload.headers,
      expiresAt: upload.expiresAt.toISOString(),
    };
  }
}
