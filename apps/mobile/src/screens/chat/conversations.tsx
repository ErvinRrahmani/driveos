import { type Href, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { type ChatViewer, conversationTitle } from '../../lib/chat';
import { useConversations } from '../../lib/student-data';
import { useStudentScope } from '../../lib/student-scope';
import { colors, EmptyState, ListItem, radius, Screen, spacing, Text } from '../../ui';
import { Loadable } from '../student/common';

function Unread({ count }: { count: number }) {
  const { t } = useTranslation();
  if (count === 0) return null;
  return (
    <View style={styles.badge} accessibilityLabel={t('chat.unread', { count })}>
      <Text variant="caption" tone="inverse">
        {count}
      </Text>
    </View>
  );
}

function Conversations({
  viewer,
  chatHref,
}: {
  viewer: ChatViewer;
  chatHref: (id: string) => Href;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const conversations = useConversations();

  return (
    <Screen title={t('chat.title')}>
      <Loadable query={conversations}>
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState
              title={t('chat.emptyTitle')}
              description={viewer === 'instructor' ? t('chat.instructorEmpty') : t('chat.empty')}
            />
          ) : (
            <>
              {data.items.map((conversation) => (
                <ListItem
                  key={conversation.id}
                  title={conversationTitle(t, conversation, viewer)}
                  subtitle={
                    conversation.lastMessage
                      ? `${conversation.lastMessage.senderName}: ${conversation.lastMessage.preview}`
                      : t('chat.noMessages')
                  }
                  accessory={<Unread count={conversation.unreadCount} />}
                  onPress={() => router.push(chatHref(conversation.id))}
                />
              ))}
            </>
          )
        }
      </Loadable>
    </Screen>
  );
}

export function ConversationsScreen() {
  const { links } = useStudentScope();
  return <Conversations viewer="student" chatHref={links.chat} />;
}

const instructorChat = (id: string): Href => ({
  pathname: '/instructor/chat/[id]',
  params: { id },
});

export function InstructorConversationsScreen() {
  return <Conversations viewer="instructor" chatHref={instructorChat} />;
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 24,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
});
