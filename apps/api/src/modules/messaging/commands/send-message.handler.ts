import { type Message, MessageSent } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
  newEvent,
  QueryBus,
} from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { MembershipDirectory } from '../../identity/index.js';
import { GetStudentRecipientsQuery } from '../../training/index.js';
import { messagePreview, otherParticipants } from '../domain/chat.js';
import { ChatAccessService, type ConversationRow } from '../infra/chat-access.js';
import { chatReadOnly } from '../infra/chat-errors.js';
import { ChatViews } from '../infra/chat-views.js';
import { ReadPointers } from '../infra/read-pointers.js';
import { conversations, messages } from '../infra/schema.js';
import { SendMessageCommand } from './send-message.command.js';

export const MESSAGE_AGGREGATE = 'message';

const SCHOOL_ROLES = ['owner', 'office'];

@CommandHandler(SendMessageCommand)
export class SendMessageHandler implements ICommandHandler<SendMessageCommand, Message> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly access: ChatAccessService,
    private readonly pointers: ReadPointers,
    private readonly views: ChatViews,
    private readonly queryBus: QueryBus,
    private readonly publisher: EventPublisher,
    @Inject(MembershipDirectory)
    private readonly directory: MembershipDirectory,
  ) {}

  async execute({ actor, conversationId, body }: SendMessageCommand): Promise<Message> {
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('Sending a message needs a school scope');
    const chat = await this.access.actor(actor);
    const { row, access } = await this.access.require(chat, conversationId, { lock: true });
    if (!access.canPost) throw chatReadOnly();
    const sentAt = new Date();
    const [message] = await this.tenant.tx
      .insert(messages)
      .values({
        id: newId(),
        schoolId,
        conversationId: row.id,
        senderUserId: chat.userId,
        body: body.body,
        sentAt,
      })
      .returning();
    if (!message) throw new Error('Message insert returned no row');
    await this.tenant.tx
      .update(conversations)
      .set({ lastMessageAt: sentAt })
      .where(eq(conversations.id, row.id));
    await this.pointers.lock(row.id, chat.membershipId);
    await this.pointers.set(row.id, chat.membershipId, message.id);
    await this.publisher.append([
      newEvent(MessageSent, {
        aggregateType: MESSAGE_AGGREGATE,
        aggregateId: message.id,
        aggregateVersion: 1,
        payload: {
          messageId: message.id,
          conversationId: row.id,
          conversationKind: row.kind,
          senderUserId: chat.userId,
          recipientUserIds: otherParticipants(await this.participants(row), chat.userId),
          preview: messagePreview(message.body),
          sentAt: sentAt.toISOString(),
        },
      }),
    ]);
    const names = await this.views.userNames([chat.userId]);
    return this.views.message(message, names.get(chat.userId) ?? '');
  }

  private async participants(row: ConversationRow): Promise<(string | null)[]> {
    const recipients = await this.queryBus.execute(new GetStudentRecipientsQuery(row.studentId));
    const people = [recipients?.studentUserId ?? null];
    if (row.kind === 'student_instructor') {
      return row.instructorMembershipId
        ? [...people, await this.directory.userIdOf(row.instructorMembershipId)]
        : people;
    }
    const staff = await this.directory.listStaff();
    return [
      ...people,
      ...staff
        .filter(
          (member) =>
            member.status === 'active' && member.roles.some((role) => SCHOOL_ROLES.includes(role)),
        )
        .map((member) => member.userId),
    ];
  }
}
