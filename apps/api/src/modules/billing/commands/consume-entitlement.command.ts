import type { EntitlementKind } from '@driveos/shared';
import { Command } from '../../../kernel/cqrs/index.js';

export interface ConsumeEntitlementInput {
  studentId: string;
  kind: EntitlementKind;
  lessonId: string;
}

export interface ConsumedEntitlement {
  entitlementId: string;
}

export class ConsumeEntitlementCommand extends Command<ConsumedEntitlement> {
  constructor(readonly input: ConsumeEntitlementInput) {
    super();
  }
}
