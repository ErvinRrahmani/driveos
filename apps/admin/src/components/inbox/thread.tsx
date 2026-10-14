import type { Conversation, Message, MessageListResponse } from '@driveos/shared';
import { type InfiniteData, useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, useAppForm } from '@/components/form';
import { ErrorState, LoadingState } from '@/components/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { useSession } from '@/hooks/use-session';
import { formatDateTimeIn } from '@/lib/format';
import { requiredText } from '@/lib/form-schemas';
import { canPost, mergeMessagePages } from '@/lib/inbox';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 30;
const REFRESH_MS = 30_000;
const MESSAGES_PATH = '/v1/conversations/{id}/messages';

function messagesKey(conversationId: string) {
  return ['get', MESSAGES_PATH, { params: { path: { id: conversationId } } }, 'infinite'] as const;
}

export function Thread({
  conversation,
  timeZone,
}: {
  conversation: Conversation;
  timeZone: string;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const { me } = useSession();
  const labelId = useId();
  const messages = useInfiniteQuery({
    queryKey: messagesKey(conversation.id),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const { data, error } = await api.fetchClient.GET(MESSAGES_PATH, {
        params: { path: { id: conversation.id }, query: { limit: PAGE_SIZE, cursor: pageParam } },
        signal,
      });
      if (error) throw error;
      return data;
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: REFRESH_MS,
  });
  const items = mergeMessagePages(messages.data?.pages ?? []);
  useMarkRead(conversation, items.at(-1));
  const postable = canPost(conversation, me.active?.membershipId);

  return (
    <section className="flex min-h-0 flex-col gap-4" aria-labelledby={labelId}>
      <h2 id={labelId} className="text-lg font-semibold">
        {conversation.studentName}
        <span className="text-muted-foreground ml-2 text-sm font-normal">
          {conversation.kind === 'student_school'
            ? t('inbox.schoolChat')
            : t('inbox.withInstructor', { name: conversation.instructorName ?? '' })}
        </span>
      </h2>
      {!postable && (
        <Alert>
          <Lock aria-hidden />
          <AlertDescription>
            {t('inbox.readOnly', {
              student: conversation.studentName,
              instructor: conversation.instructorName ?? '',
            })}
          </AlertDescription>
        </Alert>
      )}
      {messages.status === 'pending' ? (
        <LoadingState />
      ) : messages.status === 'error' ? (
        <ErrorState error={messages.error} onRetry={() => void messages.refetch()} />
      ) : (
        <div
          role="log"
          aria-label={t('inbox.messages')}
          className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto rounded-lg border p-4"
        >
          {messages.hasNextPage && (
            <Button
              variant="ghost"
              size="sm"
              className="self-center"
              disabled={messages.isFetchingNextPage}
              onClick={() => void messages.fetchNextPage()}
            >
              {t('inbox.older')}
            </Button>
          )}
          {items.length === 0 && (
            <p className="text-muted-foreground text-center text-sm">{t('inbox.noMessages')}</p>
          )}
          {items.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              mine={message.senderUserId === me.user.id}
              timeZone={timeZone}
            />
          ))}
        </div>
      )}
      {postable && <Composer conversationId={conversation.id} />}
    </section>
  );
}

function MessageBubble({
  message,
  mine,
  timeZone,
}: {
  message: Message;
  mine: boolean;
  timeZone: string;
}) {
  const { t } = useTranslation();
  return (
    <article
      className={cn(
        'max-w-[80%] rounded-lg px-3 py-2 text-sm',
        mine ? 'bg-primary text-primary-foreground self-end' : 'bg-muted self-start',
      )}
    >
      <header className="mb-1 flex gap-2 text-xs opacity-80">
        <span className="font-medium">{mine ? t('inbox.you') : message.senderName}</span>
        <time dateTime={message.sentAt}>{formatDateTimeIn(message.sentAt, timeZone)}</time>
      </header>
      <p data-testid="message-body" className="whitespace-pre-wrap">
        {message.body}
      </p>
    </article>
  );
}

function useMarkRead(conversation: Conversation, newest: Message | undefined) {
  const { api } = useServices();
  const invalidate = useInvalidate();
  const marked = useRef<string | null>(null);
  const markRead = api.$api.useMutation('post', '/v1/conversations/{id}/read', {
    onSuccess: () => void invalidate('/v1/conversations'),
  });
  const { mutate } = markRead;
  useEffect(() => {
    if (!newest || conversation.unreadCount === 0) return;
    if (conversation.lastReadMessageId === newest.id || marked.current === newest.id) return;
    marked.current = newest.id;
    mutate({ params: { path: { id: conversation.id } }, body: { lastReadMessageId: newest.id } });
  }, [conversation.id, conversation.unreadCount, conversation.lastReadMessageId, newest, mutate]);
}

const composerSchema = z.object({ body: requiredText(4000) });

function Composer({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const { api, queryClient } = useServices();
  const invalidate = useInvalidate();
  const send = useMutation({
    mutationFn: async (body: string) => {
      const { data, error } = await api.fetchClient.POST(MESSAGES_PATH, {
        params: { path: { id: conversationId } },
        body: { body },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (message) => {
      queryClient.setQueryData<InfiniteData<MessageListResponse, string | undefined>>(
        messagesKey(conversationId),
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((page, index) =>
              index === 0 ? { ...page, items: [message, ...page.items] } : page,
            ),
          },
      );
      void invalidate('/v1/conversations');
    },
  });
  const form = useAppForm({
    defaultValues: { body: '' },
    validators: { onSubmit: composerSchema },
    onSubmit: async ({ value, formApi }) => {
      try {
        await send.mutateAsync(composerSchema.parse(value).body);
        formApi.reset();
        toast.success(t('inbox.sent'));
      } catch (error) {
        reportSubmitError(form, error, t('errors.generic'));
      }
    },
  });
  return (
    <form
      className="grid gap-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="body">
        {(field) => <field.TextAreaField label={t('inbox.message')} submitOnModEnter />}
      </form.AppField>
      <div className="flex justify-end">
        <form.AppForm>
          <form.SubmitButton label={t('inbox.send')} />
        </form.AppForm>
      </div>
    </form>
  );
}
