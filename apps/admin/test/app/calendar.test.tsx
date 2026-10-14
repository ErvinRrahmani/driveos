import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { toast } from 'sonner';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { addLesson, dragWithKeyboard, findLessonBlock, IDS, lessonIn } from '../support/calendar';
import { renderApp, server, startServer } from '../support/app';
import { StatusCodes } from 'http-status-codes';

beforeAll(startServer);
afterAll(() => server.close());
afterEach(() => {
  toast.dismiss();
  vi.useRealTimers();
  server.events.removeAllListeners();
});

function recordPosts(): { path: string; body: Promise<unknown> }[] {
  const posts: { path: string; body: Promise<unknown> }[] = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method !== 'POST') return;
    posts.push({ path: new URL(request.url).pathname, body: request.clone().json() });
  });
  return posts;
}

describe('calendar', () => {
  it('shows the lessons of the week per instructor in the school time zone', async () => {
    const { mock } = renderApp({ path: '/calendar?date=2026-10-12', as: 'owner' });
    addLesson(mock, {
      id: '0192f000-0101-7000-8000-0000000000aa',
      studentId: IDS.sam,
      studentName: 'Sam Schulz',
      start: '2026-10-14T12:00:00.000Z',
      end: '2026-10-14T13:00:00.000Z',
      status: 'cancelled',
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Calendar' })).toBeTruthy();
    const block = await findLessonBlock('Stella Student');
    expect(block.textContent).toContain('09:00–10:00');
    expect(block.textContent).toContain('Standard lesson');
    expect(block.textContent).toContain('Friedrichstraße 100');
    expect(block.getAttribute('data-status')).toBe('booked');
    const cancelled = await findLessonBlock('Sam Schulz');
    expect(cancelled.getAttribute('data-status')).toBe('cancelled');
    expect(cancelled.textContent).toContain('Cancelled');
    const grid = screen.getByRole('region', { name: 'Calendar grid' });
    expect(within(grid).getAllByText('Ingo Instructor').length).toBeGreaterThan(0);
    expect(within(grid).getByText('Mon, Oct 12')).toBeTruthy();
  });

  it('pages by week and switches to the day view and vehicle columns through the URL', async () => {
    const { history } = renderApp({ path: '/calendar?date=2026-10-12', as: 'owner' });
    await findLessonBlock('Stella Student');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(history.location.search).toContain('date=2026-10-19'));
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Day' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Vehicles' }));
    await waitFor(() => expect(history.location.search).toContain('view=day'));
    expect(history.location.search).toContain('by=vehicle');
    const grid = await screen.findByRole('region', { name: 'Calendar grid' });
    expect(await within(grid).findByText('B-DS 101')).toBeTruthy();
    expect(within(grid).getByText('B-DS 102')).toBeTruthy();
    expect(await findLessonBlock('Stella Student')).toBeTruthy();
  });

  it('moves a lesson optimistically before the server answers', async () => {
    const { mock } = renderApp({ path: '/calendar?date=2026-10-12', as: 'owner' });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(http.patch('*/v1/lessons/:id', () => gate.then(() => undefined)));
    const block = await findLessonBlock('Stella Student');
    await dragWithKeyboard(block, 4);
    await waitFor(async () =>
      expect((await findLessonBlock('Stella Student')).textContent).toContain('10:00–11:00'),
    );
    expect(lessonIn(mock, IDS.stellaLesson).start).toBe('2026-10-12T07:00:00.000Z');
    release();
    await waitFor(() =>
      expect(lessonIn(mock, IDS.stellaLesson).start).toBe('2026-10-12T08:00:00.000Z'),
    );
    expect(await screen.findByText('Lesson moved')).toBeTruthy();
  });

  it('rolls a clashing move back and highlights the conflicting period', async () => {
    const { mock } = renderApp({ path: '/calendar?date=2026-10-12', as: 'owner' });
    addLesson(mock, {
      id: '0192f000-0101-7000-8000-0000000000bb',
      studentId: IDS.sam,
      studentName: 'Sam Schulz',
      start: '2026-10-12T09:00:00.000Z',
      end: '2026-10-12T10:00:00.000Z',
    });
    const block = await findLessonBlock('Stella Student');
    await findLessonBlock('Sam Schulz');
    let releaseRefetch: () => void = () => {};
    const refetchGate = new Promise<void>((resolve) => {
      releaseRefetch = resolve;
    });
    server.use(http.get('*/v1/calendar', () => refetchGate.then(() => undefined)));
    await dragWithKeyboard(block, 8);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('clashes with another booking');
    expect(alert.textContent).toContain('11:00–12:00');
    expect(screen.getByTestId('conflict-highlight')).toBeTruthy();
    expect((await findLessonBlock('Stella Student')).textContent).toContain('09:00–10:00');
    expect(lessonIn(mock, IDS.stellaLesson).start).toBe('2026-10-12T07:00:00.000Z');
    releaseRefetch();
  });
});

describe('booking', () => {
  it('validates the booking dialog', async () => {
    renderApp({ path: '/calendar?date=2026-10-12', as: 'office' });
    await findLessonBlock('Stella Student');
    await userEvent.click(screen.getByRole('button', { name: 'New booking' }));
    const dialog = await screen.findByRole('dialog', { name: 'Book a lesson' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Book' }));
    expect((await within(dialog).findAllByText('This field is required.')).length).toBe(3);
  });

  it('books a free slot with an idempotency key and shows the new lesson', async () => {
    const keys: (string | null)[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && new URL(request.url).pathname === '/v1/lessons') {
        keys.push(request.headers.get('Idempotency-Key'));
      }
    });
    const { history, mock } = renderApp({ path: '/calendar?date=2026-10-12', as: 'office' });
    await findLessonBlock('Stella Student');
    await userEvent.click(screen.getByRole('button', { name: 'Free slots' }));
    const panel = await screen.findByRole('complementary', { name: 'Free slots' });
    await userEvent.selectOptions(within(panel).getByLabelText('Lesson type'), 'Standard lesson');
    await userEvent.click(
      await within(panel).findByRole('button', { name: /Book Tue, Oct 13 10:00–11:00/ }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Book a lesson' });
    expect((within(dialog).getByLabelText('Start time') as HTMLInputElement).value).toBe('10:00');
    expect((within(dialog).getByLabelText('Date') as HTMLInputElement).value).toBe('2026-10-13');
    await userEvent.selectOptions(within(dialog).getByLabelText('Student'), 'Sam Schulz');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Book' }));
    expect(await screen.findByText('Lesson booked')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(history.location.search).toContain('date=2026-10-13');
    const booked = [...mock.store.lessons.values()].find(
      (record) => record.value.studentName === 'Sam Schulz',
    );
    expect(booked?.value.start).toBe('2026-10-13T08:00:00.000Z');
    expect(await findLessonBlock('Sam Schulz')).toBeTruthy();
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    server.events.removeAllListeners();
  });

  it('reuses the idempotency key when retrying after a server error', async () => {
    const keys: (string | null)[] = [];
    renderApp({ path: '/calendar?date=2026-10-12', as: 'office' });
    server.use(
      http.post(
        '*/v1/lessons',
        ({ request }) => {
          keys.push(request.headers.get('Idempotency-Key'));
          return HttpResponse.json(
            { error: { code: 'unavailable', message: 'Try again later.' } },
            { status: StatusCodes.SERVICE_UNAVAILABLE },
          );
        },
        { once: true },
      ),
    );
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && keys.length === 1) {
        keys.push(request.headers.get('Idempotency-Key'));
      }
    });
    await findLessonBlock('Stella Student');
    await userEvent.click(screen.getByRole('button', { name: 'New booking' }));
    const dialog = await screen.findByRole('dialog', { name: 'Book a lesson' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Student'), 'Sam Schulz');
    await userEvent.selectOptions(within(dialog).getByLabelText('Lesson type'), 'Standard lesson');
    await userEvent.selectOptions(within(dialog).getByLabelText('Instructor'), 'Ingo Instructor');
    await userEvent.selectOptions(within(dialog).getByLabelText('Vehicle'), 'B-DS 101');
    await userEvent.clear(within(dialog).getByLabelText('Date'));
    await userEvent.type(within(dialog).getByLabelText('Date'), '2026-10-14');
    await userEvent.clear(within(dialog).getByLabelText('Start time'));
    await userEvent.type(within(dialog).getByLabelText('Start time'), '14:00');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Book' }));
    expect(await screen.findByText('Try again later.')).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Book' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await findLessonBlock('Sam Schulz')).toBeTruthy();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    server.events.removeAllListeners();
  });

  it('hints at the exam car entitlement and hides the vehicle for types without one', async () => {
    renderApp({
      path: '/calendar?date=2026-10-12',
      as: 'office',
      configure: (mock) => {
        const night = mock.store.lessonTypes.get('0192f000-0006-7000-8000-000000000002');
        if (night) night.value = { ...night.value, requiresVehicle: false };
      },
    });
    await findLessonBlock('Stella Student');
    await userEvent.click(screen.getByRole('button', { name: 'New booking' }));
    const dialog = await screen.findByRole('dialog', { name: 'Book a lesson' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Lesson type'), 'Driving exam');
    expect(within(dialog).getByText(/Car for the exam/)).toBeTruthy();
    expect(within(dialog).getByLabelText('Vehicle')).toBeTruthy();
    await userEvent.selectOptions(within(dialog).getByLabelText('Lesson type'), 'Night drive');
    expect(within(dialog).queryByText(/Car for the exam/)).toBeNull();
    expect(within(dialog).queryByLabelText('Vehicle')).toBeNull();
  });
});

describe('cancelling', () => {
  it('warns about a late cancellation inside the window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-11T12:00:00Z'));
    renderApp({ path: '/calendar?date=2026-10-12', as: 'owner' });
    await userEvent.click(await findLessonBlock('Stella Student'));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel lesson' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancel lesson' });
    expect(within(dialog).getByText('Late cancellation')).toBeTruthy();
    expect(within(dialog).getByText(/24-hour cancellation window/)).toBeTruthy();
    const credit = within(dialog).getByLabelText('Credit minutes');
    expect((credit as HTMLSelectElement).value).toBe('restore');
    expect(within(credit).getByRole('option', { name: 'Give the credit back' })).toBeTruthy();
    expect(
      within(credit).getByRole('option', { name: 'Keep the credit (late cancellation)' }),
    ).toBeTruthy();
  });

  it('does not warn before the window and cancels the lesson', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T08:00:00Z'));
    const { mock } = renderApp({ path: '/calendar?date=2026-10-12', as: 'owner' });
    await userEvent.click(await findLessonBlock('Stella Student'));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel lesson' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancel lesson' });
    expect(within(dialog).queryByText('Late cancellation')).toBeNull();
    await userEvent.type(within(dialog).getByLabelText('Reason (optional)'), 'Ill');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm cancellation' }));
    expect(await screen.findByText('Lesson cancelled and 60 minutes restored')).toBeTruthy();
    await waitFor(() => expect(lessonIn(mock, IDS.stellaLesson).status).toBe('cancelled'));
    expect(lessonIn(mock, IDS.stellaLesson).cancelReason).toBe('Ill');
  });

  const lateId = '0192f000-0101-7000-8000-0000000000cc';
  async function openLateCancel() {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T08:00:00Z'));
    const rendered = renderApp({
      path: '/calendar?date=2026-10-08',
      as: 'owner',
      configure: (api) =>
        addLesson(api, {
          id: lateId,
          studentId: IDS.sam,
          studentName: 'Sam Schulz',
          start: '2026-10-08T14:00:00.000Z',
          end: '2026-10-08T15:00:00.000Z',
        }),
    });
    const posts = recordPosts();
    await userEvent.click(await findLessonBlock('Sam Schulz'));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel lesson' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancel lesson' });
    expect(within(dialog).getByText('Late cancellation')).toBeTruthy();
    return { ...rendered, posts, dialog };
  }

  it('gives the credit back by default on a late owner cancel with a single request', async () => {
    const { mock, posts, dialog } = await openLateCancel();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm cancellation' }));
    expect(await screen.findByText('Lesson cancelled and 60 minutes restored')).toBeTruthy();
    expect(posts.map((post) => post.path)).toEqual([`/v1/lessons/${lateId}/cancel`]);
    expect(await posts[0]?.body).not.toHaveProperty('restoreCredit');
    expect(lessonIn(mock, lateId).lateCancel).toBe(false);
    const restore = mock.store.ledger.filter((line) => line.entry.lessonId === lateId);
    expect(restore.map((line) => [line.entry.entryType, line.entry.minutes])).toEqual([
      ['restore', 60],
    ]);
  });

  it('keeps the credit when the owner records a late cancellation', async () => {
    const { mock, posts, dialog } = await openLateCancel();
    await userEvent.selectOptions(
      within(dialog).getByLabelText('Credit minutes'),
      'Keep the credit (late cancellation)',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm cancellation' }));
    expect(
      await screen.findByText('Lesson cancelled late; the credit minutes were kept'),
    ).toBeTruthy();
    expect(posts.map((post) => post.path)).toEqual([`/v1/lessons/${lateId}/cancel`]);
    expect(await posts[0]?.body).toMatchObject({ restoreCredit: false });
    expect(lessonIn(mock, lateId).lateCancel).toBe(true);
    expect(mock.store.ledger.filter((line) => line.entry.lessonId === lateId)).toEqual([]);
  });
});
