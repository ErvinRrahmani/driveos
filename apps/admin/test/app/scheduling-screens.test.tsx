import type {
  AddTimeOffRequest,
  AvailabilityWindow,
  CreateSlotOfferRequest,
  JoinWaitingListRequest,
  ReplaceAvailabilityRequest,
  TimeOff,
  WaitingListEntry,
} from '@driveos/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IDS } from '../support/calendar';
import { renderApp, server, startServer } from '../support/app';
import { StatusCodes } from 'http-status-codes';

beforeAll(startServer);
afterAll(() => server.close());

const id = (n: number) => `0192f000-0200-7000-8000-${String(n).padStart(12, '0')}`;

function availabilityApi() {
  const state = {
    items: [
      {
        id: id(1),
        weekday: 1,
        startTime: '08:00',
        endTime: '16:00',
        validFrom: '2026-09-01',
        validTo: null,
      },
    ] as AvailabilityWindow[],
    timeOff: [] as TimeOff[],
    puts: [] as ReplaceAvailabilityRequest[],
    posts: [] as AddTimeOffRequest[],
  };
  const response = (instructorMembershipId: string) => ({
    instructorMembershipId,
    items: state.items,
    timeOff: state.timeOff,
  });
  server.use(
    http.get('*/v1/instructors/:id/availability', ({ params }) =>
      HttpResponse.json(response(String(params.id))),
    ),
    http.put('*/v1/instructors/:id/availability', async ({ request, params }) => {
      const body = (await request.json()) as ReplaceAvailabilityRequest;
      state.puts.push(body);
      state.items = body.windows.map((window, index) => ({
        id: id(10 + index),
        ...window,
        validFrom: body.effectiveFrom,
        validTo: null,
      }));
      return HttpResponse.json(response(String(params.id)));
    }),
    http.post('*/v1/instructors/:id/time-off', async ({ request }) => {
      const body = (await request.json()) as AddTimeOffRequest;
      state.posts.push(body);
      state.timeOff = [...state.timeOff, { id: id(50), ...body, reason: body.reason ?? '' }];
      return HttpResponse.json({ id: id(50), version: 1 }, { status: StatusCodes.CREATED });
    }),
  );
  return state;
}

describe('navigation', () => {
  it('shows the scheduling screens to the owner', async () => {
    renderApp({ path: '/', as: 'owner' });
    const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
    for (const name of ['Calendar', 'Availability', 'Waiting list', 'Slot offers']) {
      expect(within(nav).getByRole('link', { name })).toBeTruthy();
    }
  });
});

describe('availability', () => {
  it('lists instructors with a link to their availability', async () => {
    const { history } = renderApp({ path: '/instructors', as: 'owner' });
    await userEvent.click(await screen.findByRole('link', { name: 'Edit availability' }));
    await waitFor(() =>
      expect(history.location.pathname).toBe(`/instructors/${IDS.ingo}/availability`),
    );
  });

  it('round-trips the weekly hours with replace semantics', async () => {
    renderApp({ path: `/instructors/${IDS.ingo}/availability`, as: 'owner' });
    const state = availabilityApi();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Availability: Ingo Instructor' }),
    ).toBeTruthy();
    const weekly = await screen.findByRole('form', { name: 'Weekly hours' });
    const monday = within(weekly).getByRole('group', { name: 'Monday' });
    expect((within(monday).getByLabelText('From') as HTMLInputElement).value).toBe('08:00');
    const tuesday = within(weekly).getByRole('group', { name: 'Tuesday' });
    expect(within(tuesday).getByText('Not available')).toBeTruthy();
    await userEvent.click(within(tuesday).getByRole('button', { name: 'Add hours on Tuesday' }));
    await userEvent.clear(within(tuesday).getByLabelText('From'));
    await userEvent.type(within(tuesday).getByLabelText('From'), '09:00');
    await userEvent.clear(within(tuesday).getByLabelText('To'));
    await userEvent.type(within(tuesday).getByLabelText('To'), '12:00');
    await userEvent.clear(within(weekly).getByLabelText('Effective from'));
    await userEvent.type(within(weekly).getByLabelText('Effective from'), '2026-10-12');
    await userEvent.click(within(weekly).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(state.puts).toHaveLength(1));
    expect(state.puts[0]).toEqual({
      effectiveFrom: '2026-10-12',
      windows: [
        { weekday: 1, startTime: '08:00', endTime: '16:00' },
        { weekday: 2, startTime: '09:00', endTime: '12:00' },
      ],
    });
    const schedule = await screen.findByRole('table', { name: 'Current schedule' });
    await waitFor(() => expect(within(schedule).getByText('09:00–12:00')).toBeTruthy());
    expect(within(schedule).getAllByText('Oct 12, 2026').length).toBe(2);
  });

  it('rejects overlapping and inverted ranges before saving', async () => {
    renderApp({ path: `/instructors/${IDS.ingo}/availability`, as: 'owner' });
    const state = availabilityApi();
    const weekly = await screen.findByRole('form', { name: 'Weekly hours' });
    const monday = within(weekly).getByRole('group', { name: 'Monday' });
    await userEvent.click(within(monday).getByRole('button', { name: 'Add hours on Monday' }));
    const froms = within(monday).getAllByLabelText('From');
    const tos = within(monday).getAllByLabelText('To');
    await userEvent.clear(froms[1] as HTMLElement);
    await userEvent.type(froms[1] as HTMLElement, '15:00');
    await userEvent.clear(tos[1] as HTMLElement);
    await userEvent.type(tos[1] as HTMLElement, '14:00');
    await userEvent.click(within(weekly).getByRole('button', { name: 'Save' }));
    expect(await within(monday).findByText('The start must be before the end.')).toBeTruthy();
    await userEvent.clear(tos[1] as HTMLElement);
    await userEvent.type(tos[1] as HTMLElement, '18:00');
    expect(
      await within(monday).findByText('This overlaps another time range on the same day.'),
    ).toBeTruthy();
    expect(state.puts).toHaveLength(0);
  });

  it('adds time off in the school time zone', async () => {
    renderApp({ path: `/instructors/${IDS.ingo}/availability`, as: 'owner' });
    const state = availabilityApi();
    const section = await screen.findByRole('form', { name: 'Time off' });
    expect(await screen.findByText('No time off planned')).toBeTruthy();
    await userEvent.type(within(section).getByLabelText('Starts'), '2026-10-19T00:00');
    await userEvent.type(within(section).getByLabelText('Ends'), '2026-10-24T00:00');
    await userEvent.type(within(section).getByLabelText('Reason'), 'Holiday');
    await userEvent.click(within(section).getByRole('button', { name: 'Add time off' }));
    await waitFor(() => expect(state.posts).toHaveLength(1));
    expect(state.posts[0]).toEqual({
      start: '2026-10-18T22:00:00.000Z',
      end: '2026-10-23T22:00:00.000Z',
      reason: 'Holiday',
    });
    expect(await screen.findByRole('cell', { name: 'Holiday' })).toBeTruthy();
  });
});

function waitingListApi() {
  const state = {
    entries: [
      {
        id: id(70),
        studentId: IDS.sam,
        studentName: 'Sam Schulz',
        lessonTypeId: IDS.standardType,
        preferredWindows: [{ weekday: 2, start: '15:00', end: '19:00' }],
        area: 'Kreuzberg',
        active: true,
        createdAt: '2026-10-01T12:00:00.000Z',
      },
    ] as WaitingListEntry[],
    joins: [] as JoinWaitingListRequest[],
  };
  server.use(
    http.get('*/v1/waiting-list', () =>
      HttpResponse.json({ items: state.entries, nextCursor: null }),
    ),
    http.post('*/v1/waiting-list', async ({ request }) => {
      const body = (await request.json()) as JoinWaitingListRequest;
      state.joins.push(body);
      state.entries = [
        ...state.entries,
        {
          id: id(71),
          ...body,
          studentName: 'Stella Student',
          active: true,
          createdAt: '2026-10-08T08:00:00.000Z',
        },
      ];
      return HttpResponse.json({ id: id(71), version: 1 }, { status: StatusCodes.CREATED });
    }),
    http.delete('*/v1/waiting-list/:id', ({ params }) => {
      state.entries = state.entries.filter((entry) => entry.id !== params.id);
      return new HttpResponse(null, { status: StatusCodes.NO_CONTENT });
    }),
  );
  return state;
}

describe('waiting list', () => {
  it('adds a student with preferred times and removes another', async () => {
    renderApp({ path: '/waiting-list', as: 'office' });
    const state = waitingListApi();
    const table = await screen.findByRole('table', { name: 'Waiting list' });
    expect(await within(table).findByText('Sam Schulz')).toBeTruthy();
    expect(within(table).getByText('Tue 15:00–19:00')).toBeTruthy();
    expect(within(table).getByText('Standard lesson')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Add to waiting list' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add to the waiting list' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Add at least one preferred time.')).toBeTruthy();
    await userEvent.selectOptions(within(dialog).getByLabelText('Student'), 'Stella Student');
    await userEvent.selectOptions(within(dialog).getByLabelText('Lesson type'), 'Night drive');
    await userEvent.type(within(dialog).getByLabelText('Area'), 'Mitte');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add a preferred time' }));
    await userEvent.selectOptions(within(dialog).getByLabelText('Day'), 'Thursday');
    await userEvent.clear(within(dialog).getByLabelText('From'));
    await userEvent.type(within(dialog).getByLabelText('From'), '17:00');
    await userEvent.clear(within(dialog).getByLabelText('To'));
    await userEvent.type(within(dialog).getByLabelText('To'), '20:00');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(state.joins).toHaveLength(1));
    expect(state.joins[0]).toEqual({
      studentId: '0192f000-0007-7000-8000-000000000001',
      lessonTypeId: '0192f000-0006-7000-8000-000000000002',
      area: 'Mitte',
      preferredWindows: [{ weekday: 4, start: '17:00', end: '20:00' }],
    });
    expect(await within(table).findByText('Thu 17:00–20:00')).toBeTruthy();

    await userEvent.click(
      within(table).getByRole('button', { name: 'Remove Sam Schulz from the waiting list' }),
    );
    await waitFor(() => expect(within(table).queryByText('Sam Schulz')).toBeNull());
    expect(state.entries.map((entry) => entry.studentName)).toEqual(['Stella Student']);
  });
});

describe('slot offers', () => {
  it('lists offers and creates a manual one in the school time zone', async () => {
    const created: CreateSlotOfferRequest[] = [];
    renderApp({ path: '/slot-offers', as: 'owner' });
    server.use(
      http.post('*/v1/slot-offers', async ({ request }) => {
        created.push((await request.json()) as CreateSlotOfferRequest);
        return HttpResponse.json({ id: id(90), version: 1 }, { status: StatusCodes.CREATED });
      }),
    );
    const table = await screen.findByRole('table', { name: 'Slot offers' });
    expect(await within(table).findByText('Standard lesson')).toBeTruthy();
    expect(within(table).getByText('Cancellation')).toBeTruthy();
    expect(within(table).getByText('Open')).toBeTruthy();
    expect(within(table).getByText('Wed, Oct 14 16:00–17:00')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Offer a slot' }));
    const dialog = await screen.findByRole('dialog', { name: 'New slot offer' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Instructor'), 'Ingo Instructor');
    await userEvent.selectOptions(within(dialog).getByLabelText('Lesson type'), 'Standard lesson');
    await userEvent.selectOptions(within(dialog).getByLabelText('Vehicle'), 'B-DS 102');
    await userEvent.clear(within(dialog).getByLabelText('Date'));
    await userEvent.type(within(dialog).getByLabelText('Date'), '2026-10-15');
    await userEvent.clear(within(dialog).getByLabelText('Start time'));
    await userEvent.type(within(dialog).getByLabelText('Start time'), '14:30');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toEqual({
      instructorMembershipId: IDS.ingo,
      lessonTypeId: IDS.standardType,
      vehicleId: '0192f000-0005-7000-8000-000000000002',
      start: '2026-10-15T12:30:00.000Z',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  async function fillOfferForm() {
    await userEvent.click(await screen.findByRole('button', { name: 'Offer a slot' }));
    const dialog = await screen.findByRole('dialog', { name: 'New slot offer' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Instructor'), 'Ingo Instructor');
    await userEvent.selectOptions(within(dialog).getByLabelText('Lesson type'), 'Standard lesson');
    await userEvent.selectOptions(within(dialog).getByLabelText('Vehicle'), 'B-DS 102');
    await userEvent.clear(within(dialog).getByLabelText('Date'));
    await userEvent.type(within(dialog).getByLabelText('Date'), '2026-10-15');
    return dialog;
  }

  it('offers a slot only to the chosen students', async () => {
    const created: CreateSlotOfferRequest[] = [];
    renderApp({ path: '/slot-offers', as: 'owner' });
    server.use(
      http.post('*/v1/slot-offers', async ({ request }) => {
        created.push((await request.json()) as CreateSlotOfferRequest);
        return HttpResponse.json({ id: id(91), version: 1 }, { status: StatusCodes.CREATED });
      }),
    );
    const dialog = await fillOfferForm();
    const students = within(dialog).getByRole('group', { name: 'Offer only to these students' });
    await userEvent.click(
      await within(students).findByRole('checkbox', { name: 'Stella Student' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toMatchObject({
      instructorMembershipId: IDS.ingo,
      studentIds: ['0192f000-0007-7000-8000-000000000001'],
    });
  });

  it.each([
    [
      'no_eligible_students',
      'Nobody can take this slot: no student on the waiting list or with enough credit matches it. Choose students or another time.',
    ],
    [
      'slot_unavailable',
      'This slot cannot be offered: the instructor is busy then or it starts too soon.',
    ],
    ['lesson_conflict', 'The instructor or the vehicle is already booked at that time.'],
  ])('explains a 409 %s and keeps the form open', async (code, message) => {
    renderApp({ path: '/slot-offers', as: 'owner' });
    server.use(
      http.post('*/v1/slot-offers', () =>
        HttpResponse.json(
          { error: { code, message: 'Server text' } },
          { status: StatusCodes.CONFLICT },
        ),
      ),
    );
    const dialog = await fillOfferForm();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'New slot offer' })).toBeTruthy();
  });

  it('manages the waiting list from a tab on the slot offers page', async () => {
    const view = renderApp({ path: '/slot-offers', as: 'owner' });
    const state = waitingListApi();
    await userEvent.click(await screen.findByRole('tab', { name: 'Waiting list' }));
    await waitFor(() =>
      expect(view.router.state.location.search).toMatchObject({ view: 'waiting' }),
    );
    const table = await screen.findByRole('table', { name: 'Waiting list' });
    expect(await within(table).findByText('Sam Schulz')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add to waiting list' })).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Slot offers' })).toBeNull();
    await userEvent.click(
      within(table).getByRole('button', { name: 'Remove Sam Schulz from the waiting list' }),
    );
    await waitFor(() => expect(state.entries).toEqual([]));

    await userEvent.click(screen.getByRole('tab', { name: 'Offers' }));
    expect(await screen.findByRole('table', { name: 'Slot offers' })).toBeTruthy();
    expect(view.router.state.location.search).not.toHaveProperty('view', 'waiting');
  });

  it('opens the waiting list tab from the URL', async () => {
    renderApp({ path: '/slot-offers?view=waiting', as: 'owner' });
    waitingListApi();
    const table = await screen.findByRole('table', { name: 'Waiting list' });
    expect(await within(table).findByText('Sam Schulz')).toBeTruthy();
  });
});
