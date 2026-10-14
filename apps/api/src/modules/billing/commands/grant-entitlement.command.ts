import type { EntitlementKind } from '@driveos/shared';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export interface GrantEntitlementInput {
  studentId: string;
  kind: EntitlementKind;
  paymentId?: string | null;
}

export class GrantEntitlementCommand extends Command<CommandResult> {
  constructor(readonly input: GrantEntitlementInput) {
    super();
  }
}
