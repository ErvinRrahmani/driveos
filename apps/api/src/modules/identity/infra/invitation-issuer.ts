import { Injectable } from '@nestjs/common';
import { InvitationCreated, type MembershipRole } from '@driveos/shared';
import { EventPublisher, newEvent } from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { CreatedInvitation } from '../commands/create-invitation.command.js';
import { invalidField } from '../commands/identity-errors.js';
import { type ContactKind, normalizeContact } from '../domain/contact.js';
import { invitationExpiry } from '../domain/invitation.js';
import { normalizeRoles } from '../domain/membership.js';
import { generateInvitationToken, hashSecret } from '../domain/secrets.js';
import { IdentitySettings } from './identity-settings.js';
import { InvitationsRepository } from './invitations.repository.js';

export interface InvitationInput {
  invitedBy: string;
  roles: readonly MembershipRole[];
  contact: { phone?: string; email?: string };
  studentId: string | null;
  branchIds: readonly string[];
}

function contactOf(kind: ContactKind, raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const contact = normalizeContact(raw);
  if (contact?.kind !== kind) {
    throw invalidField(
      [kind],
      kind === 'phone' ? 'Expected an E.164 phone number' : 'Expected an email',
    );
  }
  return contact.value;
}

@Injectable()
export class InvitationIssuer {
  constructor(
    private readonly tenant: TenantContext,
    private readonly invitations: InvitationsRepository,
    private readonly settings: IdentitySettings,
    private readonly publisher: EventPublisher,
  ) {}

  contacts(contact: InvitationInput['contact']): { phone: string | null; email: string | null } {
    return { phone: contactOf('phone', contact.phone), email: contactOf('email', contact.email) };
  }

  async issue(input: InvitationInput): Promise<CreatedInvitation> {
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('An invitation needs a school');
    const { phone, email } = this.contacts(input.contact);
    const id = newId();
    const acceptToken = generateInvitationToken();
    const expiresAt = invitationExpiry(new Date());
    const roles = normalizeRoles(input.roles);
    await this.invitations.insert({
      id,
      schoolId,
      roles,
      phone,
      email,
      studentId: input.studentId,
      branchIds: [...new Set(input.branchIds)],
      invitedBy: input.invitedBy,
      expiresAt,
      tokenHash: hashSecret(this.settings.pepper, acceptToken),
    });
    await this.publisher.append([
      newEvent(InvitationCreated, {
        aggregateType: 'invitation',
        aggregateId: id,
        aggregateVersion: 1,
        payload: {
          invitationId: id,
          schoolId,
          roles,
          phone,
          email,
          studentId: input.studentId,
          invitedBy: input.invitedBy,
          expiresAt: expiresAt.toISOString(),
          acceptToken,
        },
      }),
    ]);
    return { id, version: 1, acceptToken };
  }
}
