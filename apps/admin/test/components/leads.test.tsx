import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderApp, server, startServer } from '../support/app';

beforeAll(startServer);
afterEach(() => server.events.removeAllListeners());
afterAll(() => server.close());

const LENA = '0192f000-0121-7000-8000-000000000001';

interface Sent {
  headers: Headers;
  body: Promise<unknown>;
}

function recordPosts(pathname: RegExp): Sent[] {
  const sent: Sent[] = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method !== 'POST' || !pathname.test(new URL(request.url).pathname)) return;
    sent.push({ headers: request.headers, body: request.clone().json() });
  });
  return sent;
}

const navLinks = async () => {
  const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.textContent);
};

describe('leads inbox', () => {
  it('is in the navigation and lists the mock leads', async () => {
    renderApp({ path: '/', as: 'office' });
    const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
    await userEvent.click(within(nav).getByRole('link', { name: 'Leads' }));
    const table = await screen.findByRole('table', { name: 'Leads' });
    const lena = await within(table).findByRole('row', { name: /Lena Lead/ });
    expect(within(lena).getByText('New')).toBeTruthy();
    expect(within(lena).getByText('+4915550000020')).toBeTruthy();
    const sam = within(table).getByRole('row', { name: /Sam Schulz/ });
    expect(within(sam).getByText('Converted')).toBeTruthy();
  });

  it('hides the leads item when the plan lacks the enrolment page', async () => {
    renderApp({
      path: '/',
      as: 'office',
      configure: (mock) => {
        for (const plan of mock.store.plans.values()) plan.value.features = [];
      },
    });
    expect(await navLinks()).not.toContain('Leads');
  });

  it('filters by status tab through the URL', async () => {
    const { history } = renderApp({ path: '/leads', as: 'office' });
    const table = await screen.findByRole('table', { name: 'Leads' });
    await within(table).findByText('Lena Lead');
    await userEvent.click(screen.getByRole('tab', { name: 'Converted' }));
    await waitFor(() => expect(history.location.search).toContain('status=converted'));
    await waitFor(() => expect(within(table).queryByText('Lena Lead')).toBeNull());
    expect(within(table).getByText('Sam Schulz')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'New' }));
    await waitFor(() => expect(within(table).queryByText('Sam Schulz')).toBeNull());
    expect(within(table).getByText('Lena Lead')).toBeTruthy();
  });

  it('searches by name, phone or email', async () => {
    const { history } = renderApp({ path: '/leads', as: 'office' });
    const table = await screen.findByRole('table', { name: 'Leads' });
    await within(table).findByText('Lena Lead');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search leads' }), 'sam');
    await waitFor(() => expect(history.location.search).toContain('q=sam'));
    await waitFor(() => expect(within(table).queryByText('Lena Lead')).toBeNull());
  });

  it('opens the lead in a drawer and marks it as contacted with a note', async () => {
    const { mock, history } = renderApp({ path: '/leads', as: 'office' });
    const table = await screen.findByRole('table', { name: 'Leads' });
    await userEvent.click(await within(table).findByRole('button', { name: 'Lena Lead' }));
    await waitFor(() => expect(history.location.search).toContain(`lead=${LENA}`));
    const drawer = await screen.findByRole('dialog', { name: 'Lena Lead' });
    expect(within(drawer).getByText('Can I start in November?')).toBeTruthy();
    await userEvent.type(within(drawer).getByLabelText('Notes'), 'Called back, wants Tuesdays.');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Save note' }));
    await waitFor(() =>
      expect(mock.store.leads.get(LENA)?.value.note).toBe('Called back, wants Tuesdays.'),
    );
    await userEvent.click(within(drawer).getByRole('button', { name: 'Mark as contacted' }));
    await waitFor(() => expect(mock.store.leads.get(LENA)?.value.status).toBe('contacted'));
    expect(await within(drawer).findByText('Contacted')).toBeTruthy();
  });

  it('marks a lead as lost with a reason', async () => {
    const { mock } = renderApp({ path: `/leads?lead=${LENA}`, as: 'office' });
    const drawer = await screen.findByRole('dialog', { name: 'Lena Lead' });
    await userEvent.click(within(drawer).getByRole('button', { name: 'Mark as lost' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mark as lost' });
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Chose another school');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark as lost' }));
    await waitFor(() =>
      expect(mock.store.leads.get(LENA)?.value).toMatchObject({
        status: 'lost',
        lostReason: 'Chose another school',
      }),
    );
  });

  it('converts a lead with an Idempotency-Key and opens the new student', async () => {
    const sent = recordPosts(/\/v1\/leads\/[^/]+\/convert$/);
    const { mock, history } = renderApp({ path: `/leads?lead=${LENA}`, as: 'office' });
    const drawer = await screen.findByRole('dialog', { name: 'Lena Lead' });
    await userEvent.click(within(drawer).getByRole('button', { name: 'Convert to student' }));
    const dialog = await screen.findByRole('dialog', { name: 'Convert to student' });
    expect(within(dialog).getByText('Lena Lead')).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Convert' }));
    expect(await within(dialog).findByText('This field is required.')).toBeTruthy();
    expect(sent).toHaveLength(0);
    await userEvent.type(within(dialog).getByLabelText('Date of birth'), '2004-05-06');
    expect(
      within(dialog).getByRole('switch', { name: 'Send the app invitation now' }),
    ).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Convert' }));
    await waitFor(() => expect(history.location.pathname).toMatch(/^\/students\/[0-9a-f-]{36}$/));
    expect(sent).toHaveLength(1);
    expect(sent[0]?.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(await sent[0]?.body).toEqual({
      dateOfBirth: '2004-05-06',
      examLanguage: 'en',
      invite: true,
      inviteParent: false,
    });
    const studentId = history.location.pathname.split('/').pop() ?? '';
    expect(mock.store.leads.get(LENA)?.value).toMatchObject({ status: 'converted', studentId });
    expect(mock.store.students.get(studentId)?.value).toMatchObject({
      fullName: 'Lena Lead',
      licenceClass: 'B',
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Lena Lead' })).toBeTruthy();
  });

  it('links a converted lead to the student profile', async () => {
    renderApp({ path: '/leads?status=converted', as: 'office' });
    const table = await screen.findByRole('table', { name: 'Leads' });
    await userEvent.click(await within(table).findByRole('button', { name: 'Sam Schulz' }));
    const drawer = await screen.findByRole('dialog', { name: 'Sam Schulz' });
    expect(within(drawer).queryByRole('button', { name: 'Convert to student' })).toBeNull();
    expect(within(drawer).getByRole('link', { name: 'Open student profile' })).toBeTruthy();
  });

  it('adds a manual lead', async () => {
    const { mock } = renderApp({ path: '/leads', as: 'office' });
    await userEvent.click(await screen.findByRole('button', { name: 'Add lead' }));
    const dialog = await screen.findByRole('dialog', { name: 'New lead' });
    await userEvent.type(within(dialog).getByLabelText('Full name'), 'Walter Walk-in');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await within(dialog).findByText('Enter a phone number or an email address.'),
    ).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText('Phone'), '+4915550000022');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    const table = await screen.findByRole('table', { name: 'Leads' });
    expect(await within(table).findByText('Walter Walk-in')).toBeTruthy();
    const created = [...mock.store.leads.values()].find(
      (record) => record.value.fullName === 'Walter Walk-in',
    );
    expect(created?.value).toMatchObject({ source: 'manual', status: 'new', isMinor: false });
  });
});
