import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusCodes } from 'http-status-codes';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderApp, server, startServer } from '../support/app';

beforeAll(startServer);
afterEach(() => server.events.removeAllListeners());
afterAll(() => server.close());

const TEJO_SCHOOL = '0192f000-0001-7000-8000-000000000002';
const OTTO = '0192f000-0002-7000-8000-000000000002';

async function signIn(contact: string) {
  await userEvent.type(await screen.findByLabelText('Phone or email'), contact);
  await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
  await userEvent.type(await screen.findByLabelText('Code'), '000000');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

const navLinks = async () => {
  const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.textContent);
};

describe('admin shell', () => {
  it('sends a signed-out visitor to the login page and back after signing in', async () => {
    const { history } = renderApp({ path: '/branches' });
    expect(await screen.findByRole('heading', { name: 'Sign in to DriveOS' })).toBeTruthy();
    await signIn('otto.owner@example.com');
    expect(await screen.findByRole('heading', { name: 'Branches' })).toBeTruthy();
    expect(history.location.pathname).toBe('/branches');
    expect(screen.getByText('Fahrschule Spree')).toBeTruthy();
  });

  it('shows an inline error for a wrong code', async () => {
    renderApp({ path: '/login' });
    await userEvent.type(await screen.findByLabelText('Phone or email'), 'otto.owner@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    await userEvent.type(await screen.findByLabelText('Code'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('The code is wrong or has expired.')).toBeTruthy();
  });

  it('lets a user with several schools choose one after signing in', async () => {
    renderApp({
      path: '/login',
      configure: (mock) => {
        mock.store.memberships.set('0192f000-0003-7000-8000-0000000000aa', {
          id: '0192f000-0003-7000-8000-0000000000aa',
          userId: OTTO,
          schoolId: TEJO_SCHOOL,
          roles: ['office'],
          status: 'active',
          branchIds: [],
          grants: [],
          version: 1,
        });
      },
    });
    await signIn('otto.owner@example.com');
    expect(await screen.findByRole('heading', { name: 'Choose a school' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Escola de Condução Tejo/ }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /Escola de Condução Tejo/ })).toBeTruthy();
    expect(await navLinks()).not.toContain('Price items');
  });

  it('shows the owner every screen and leads the dashboard with the growth report', async () => {
    renderApp({ path: '/', as: 'owner' });
    expect(await screen.findByRole('heading', { name: 'Growth report' })).toBeTruthy();
    expect(await screen.findByText('€6,000.00')).toBeTruthy();
    expect(await navLinks()).toEqual([
      'Dashboard',
      'Calendar',
      'Students',
      'Leads',
      'Availability',
      'Waiting list',
      'Slot offers',
      'Inbox',
      'Invoices',
      'Payments',
      'Reports',
      'School settings',
      'Branches',
      'Vehicles',
      'Staff',
      'Lesson types',
      'Price items',
      'Platform statements',
      'Audit log',
    ]);
  });

  it('hides school settings and prices from office staff', async () => {
    renderApp({ path: '/', as: 'office' });
    expect(await navLinks()).toEqual([
      'Dashboard',
      'Calendar',
      'Students',
      'Leads',
      'Availability',
      'Waiting list',
      'Slot offers',
      'Inbox',
      'Invoices',
      'Payments',
      'Branches',
      'Vehicles',
      'Staff',
      'Lesson types',
    ]);
    expect(screen.queryByRole('heading', { name: 'Growth report' })).toBeNull();
  });

  it('blocks a direct visit to a screen the role cannot use', async () => {
    renderApp({ path: '/price-items', as: 'office' });
    expect(await screen.findByText('You do not have access to this page.')).toBeTruthy();
  });

  it('tells students the admin app is for staff', async () => {
    renderApp({ path: '/', as: 'student' });
    expect(
      await screen.findByRole('heading', { name: 'This app is for school staff' }),
    ).toBeTruthy();
  });

  it('switches school from the header', async () => {
    renderApp({
      path: '/',
      as: 'owner',
      configure: (mock) => {
        mock.store.memberships.set('0192f000-0003-7000-8000-0000000000aa', {
          id: '0192f000-0003-7000-8000-0000000000aa',
          userId: OTTO,
          schoolId: TEJO_SCHOOL,
          roles: ['office'],
          status: 'active',
          branchIds: [],
          grants: [],
          version: 1,
        });
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: /Fahrschule Spree/ }));
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: /Escola de Condução Tejo/ }),
    );
    expect(await screen.findByRole('button', { name: /Escola de Condução Tejo/ })).toBeTruthy();
    await waitFor(async () => expect(await navLinks()).not.toContain('Price items'));
  });

  it('returns to the login page when the session cannot be refreshed', async () => {
    const { history } = renderApp({
      path: '/branches',
      configure: (mock) => mock.store.sessions.clear(),
      session: { accessToken: 'stale-access', refreshToken: 'stale-refresh' },
    });
    expect(await screen.findByRole('heading', { name: 'Sign in to DriveOS' })).toBeTruthy();
    expect(new URLSearchParams(history.location.search).get('redirect')).toBe('/branches');
  });

  it('signs out and returns to the login page', async () => {
    const { services } = renderApp({ path: '/', as: 'owner' });
    await userEvent.click(await screen.findByRole('button', { name: 'Account' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in to DriveOS' })).toBeTruthy();
    expect(services.auth.isAuthenticated()).toBe(false);
  });

  describe('bootstrap', () => {
    function recordMe() {
      const statuses: number[] = [];
      server.events.on('response:mocked', ({ request, response }) => {
        if (new URL(request.url).pathname === '/v1/me') statuses.push(response.status);
      });
      return statuses;
    }

    it('loads /v1/me once under StrictMode', async () => {
      renderApp({ path: '/branches', as: 'owner', strict: true });
      const statuses = recordMe();
      expect(await screen.findByRole('table', { name: 'Branches' })).toBeTruthy();
      expect(await screen.findByRole('navigation', { name: 'Main navigation' })).toBeTruthy();
      expect(statuses).toEqual([StatusCodes.OK]);
    });

    it('refreshes before the first request after a reload instead of failing with 401', async () => {
      renderApp({ path: '/branches', as: 'owner', strict: true, reload: true });
      const statuses = recordMe();
      expect(await screen.findByRole('table', { name: 'Branches' })).toBeTruthy();
      expect(statuses).toEqual([StatusCodes.OK]);
    });
  });
});
