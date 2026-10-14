import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderApp, server, startServer } from '../support/app';
import { MONEY } from '../support/money';
import { capture } from '../support/students';
import { StatusCodes } from 'http-status-codes';

beforeAll(startServer);
afterAll(() => server.close());

const OTTO_USER = '0192f000-0002-7000-8000-000000000002';
const inbox = (conversationId?: string) =>
  conversationId ? `/inbox?conversationId=${conversationId}` : '/inbox';

describe('inbox', () => {
  it('lists conversations with unread counts and opens one through the URL', async () => {
    const view = renderApp({ path: inbox(), as: 'owner' });
    const list = await screen.findByRole('list', { name: 'Conversations' });
    const items = await within(list).findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText('1 unread')).toBeTruthy();
    expect(within(items[0] as HTMLElement).getByText('With Ingo Instructor')).toBeTruthy();
    expect(within(items[1] as HTMLElement).getByText('School chat')).toBeTruthy();
    await userEvent.click(within(items[1] as HTMLElement).getByRole('link'));
    await waitFor(() =>
      expect(view.router.state.location.search).toMatchObject({
        conversationId: MONEY.schoolChat,
      }),
    );
  });

  it('shows instructor chats read-only, without a composer, and marks them read', async () => {
    renderApp({ path: inbox(MONEY.instructorChat), as: 'owner' });
    const reads = capture(
      'post',
      '*/v1/conversations/:id/read',
      { conversationId: MONEY.instructorChat, lastReadMessageId: MONEY.message, unreadCount: 0 },
      StatusCodes.OK,
    );
    const thread = await screen.findByRole('log', { name: 'Messages' });
    const bodies = await within(thread).findAllByTestId('message-body');
    expect(bodies.map((body) => body.textContent)).toEqual([
      'Where do we meet tomorrow?',
      'I will pick you up at the station at 08:00.',
    ]);
    expect(
      screen.getByText(
        'This is a private chat between Stella Student and Ingo Instructor. The school can read it but cannot reply.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
    await waitFor(() => expect(reads).toHaveLength(1));
    expect(reads[0]?.url.pathname).toBe(`/v1/conversations/${MONEY.instructorChat}/read`);
    expect(reads[0]?.body).toEqual({ lastReadMessageId: MONEY.message });
  });

  it('sends a message in a school chat', async () => {
    renderApp({ path: inbox(MONEY.schoolChat), as: 'owner' });
    const sent = capture(
      'post',
      '*/v1/conversations/:id/messages',
      {
        id: '0192f000-011b-7000-8000-0000000000aa',
        conversationId: MONEY.schoolChat,
        senderUserId: OTTO_USER,
        senderName: 'Otto Owner',
        body: 'Your exam is on Friday.',
        sentAt: '2026-10-08T08:00:00.000Z',
      },
      StatusCodes.CREATED,
    );
    const composer = await screen.findByRole('textbox', { name: 'Message' });
    expect(screen.queryByText(/cannot reply/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('This field is required.')).toBeTruthy();
    await userEvent.type(composer, 'Your exam is on Friday.');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.url.pathname).toBe(`/v1/conversations/${MONEY.schoolChat}/messages`);
    expect(sent[0]?.body).toEqual({ body: 'Your exam is on Friday.' });
    const thread = screen.getByRole('log', { name: 'Messages' });
    expect(await within(thread).findByText('Your exam is on Friday.')).toBeTruthy();
    expect((composer as HTMLTextAreaElement).value).toBe('');
  });

  it('does not mark a conversation read when nothing is unread', async () => {
    renderApp({ path: inbox(MONEY.schoolChat), as: 'office' });
    const reads = capture('post', '*/v1/conversations/:id/read', {}, StatusCodes.OK);
    await screen.findByRole('log', { name: 'Messages' });
    await screen.findAllByTestId('message-body');
    expect(reads).toHaveLength(0);
  });
});
