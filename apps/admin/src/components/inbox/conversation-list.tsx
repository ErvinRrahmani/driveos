import type { Conversation } from '@driveos/shared';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { formatDateTimeIn } from '@/lib/format';
import { cn } from '@/lib/utils';

export function ConversationList({
  conversations,
  selectedId,
  timeZone,
}: {
  conversations: readonly Conversation[];
  selectedId: string | undefined;
  timeZone: string;
}) {
  const { t } = useTranslation();
  return (
    <ul aria-label={t('inbox.conversations')} className="divide-y self-start rounded-lg border">
      {conversations.map((conversation) => {
        const selected = conversation.id === selectedId;
        return (
          <li key={conversation.id}>
            <Link
              from="/inbox"
              search={(prev) => ({ ...prev, conversationId: conversation.id })}
              aria-current={selected ? 'page' : undefined}
              className={cn(
                'hover:bg-muted/60 flex flex-col gap-1 px-4 py-3 text-sm',
                selected && 'bg-muted',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{conversation.studentName}</span>
                {conversation.unreadCount > 0 && (
                  <Badge>{t('inbox.unread', { count: conversation.unreadCount })}</Badge>
                )}
              </span>
              <span className="text-muted-foreground text-xs">
                {conversation.kind === 'student_school'
                  ? t('inbox.schoolChat')
                  : t('inbox.withInstructor', { name: conversation.instructorName ?? '' })}
              </span>
              <span className="text-muted-foreground line-clamp-1">
                {conversation.lastMessage
                  ? `${conversation.lastMessage.senderName}: ${conversation.lastMessage.preview}`
                  : t('inbox.noMessages')}
              </span>
              {conversation.lastMessage && (
                <span className="text-muted-foreground text-xs">
                  {formatDateTimeIn(conversation.lastMessage.sentAt, timeZone)}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
