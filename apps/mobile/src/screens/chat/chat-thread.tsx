import { MESSAGE_BODY_MAX } from '@driveos/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { errorMessage } from '../../components/error-message';
import { send } from '../../lib/flow';
import { formatDateTime } from '../../lib/format';
import { useMe, useServices } from '../../lib/session';
import { useConversations, useDisplayZone, useMessages } from '../../lib/student-data';
import { Banner, Button, colors, Input, radius, Screen, spacing, Text } from '../../ui';
import { type ChatViewer, conversationTitle } from '../../lib/chat';
import { Loadable } from '../student/common';

function ChatThread({ viewer }: { viewer: ChatViewer }) {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const services = useServices();
  const queryClient = useQueryClient();
  const me = useMe();
  const conversations = useConversations();
  const messages = useMessages(id);
  const zone = useDisplayZone();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const markedRead = useRef<string | null>(null);

  const conversation = conversations.data?.items.find((item) => item.id === id);
  const ordered = [...(messages.data?.items ?? [])].sort((a, b) =>
    a.sentAt.localeCompare(b.sentAt),
  );
  const lastId = ordered.at(-1)?.id;
  const title = conversation ? conversationTitle(t, conversation, viewer) : undefined;

  useEffect(() => {
    if (title) navigation.setOptions({ title });
  }, [navigation, title]);

  useEffect(() => {
    if (!lastId || !conversation || conversation.lastReadMessageId === lastId) return;
    if (markedRead.current === lastId) return;
    markedRead.current = lastId;
    void services.api.fetchClient
      .POST('/v1/conversations/{id}/read', {
        params: { path: { id } },
        body: { lastReadMessageId: lastId },
      })
      .then(() => queryClient.invalidateQueries({ queryKey: ['get', '/v1/conversations'] }));
  }, [conversation, id, lastId, queryClient, services]);

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setFailure(null);
    const result = await send(() =>
      services.api.fetchClient.POST('/v1/conversations/{id}/messages', {
        params: { path: { id } },
        body: { body },
      }),
    );
    setSending(false);
    if (!result.ok) {
      setFailure(errorMessage(t, result));
      return;
    }
    setDraft('');
    await queryClient.invalidateQueries({ queryKey: ['get', '/v1/conversations/{id}/messages'] });
  };

  const myId = me.data?.user.id;
  const readOnly = conversation?.readOnly === true;

  return (
    <Screen>
      {conversation?.schoolCanRead || conversation?.kind === 'student_instructor' ? (
        <Banner tone="info" message={t('chat.schoolCanRead')} />
      ) : null}
      <Loadable query={messages}>
        {() => (
          <View style={styles.thread}>
            {ordered.length === 0 ? <Text tone="muted">{t('chat.noMessages')}</Text> : null}
            {ordered.map((message) => {
              const mine = message.senderUserId === myId;
              return (
                <View key={message.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                  <Text variant="caption" tone={mine ? 'inverse' : 'muted'}>
                    {mine ? t('chat.you') : message.senderName} ·{' '}
                    {formatDateTime(message.sentAt, zone)}
                  </Text>
                  <Text tone={mine ? 'inverse' : 'default'}>{message.body}</Text>
                </View>
              );
            })}
          </View>
        )}
      </Loadable>
      {failure ? <Banner tone="danger" message={failure} /> : null}
      {readOnly ? (
        <Text tone="muted">{t('chat.readOnly')}</Text>
      ) : (
        <>
          <Input
            label={t('chat.message')}
            value={draft}
            onChangeText={setDraft}
            maxLength={MESSAGE_BODY_MAX}
            multiline
          />
          <Button
            title={t('chat.send')}
            loading={sending}
            disabled={draft.trim().length === 0}
            onPress={() => void submit()}
          />
        </>
      )}
    </Screen>
  );
}

export function ChatThreadScreen() {
  return <ChatThread viewer="student" />;
}

export function InstructorChatThreadScreen() {
  return <ChatThread viewer="instructor" />;
}

const styles = StyleSheet.create({
  thread: { gap: spacing.sm },
  bubble: { padding: spacing.md, borderRadius: radius.lg, maxWidth: '85%', gap: 2 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
