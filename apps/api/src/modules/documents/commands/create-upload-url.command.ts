import type { CreateUploadUrlRequest, CreateUploadUrlResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export class CreateUploadUrlCommand extends Command<CreateUploadUrlResponse> {
  constructor(
    readonly actor: Principal,
    readonly body: CreateUploadUrlRequest,
  ) {
    super();
  }
}
