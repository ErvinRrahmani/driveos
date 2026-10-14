import type { SignContractRequest, SignContractResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export interface SigningClient {
  ip: string | null;
  userAgent: string | null;
}

export class SignContractCommand extends Command<SignContractResponse> {
  constructor(
    readonly actor: Principal,
    readonly contractId: string,
    readonly body: SignContractRequest,
    readonly client: SigningClient,
  ) {
    super();
  }
}
