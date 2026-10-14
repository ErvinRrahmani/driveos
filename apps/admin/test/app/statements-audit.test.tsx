import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderApp, server, startServer } from '../support/app';

beforeAll(startServer);
afterEach(() => server.events.removeAllListeners());
afterAll(() => server.close());

function recordQueries(pathname: string): URL[] {
  const calls: URL[] = [];
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url);
    if (url.pathname === pathname) calls.push(url);
  });
  return calls;
}

describe('platform statements', () => {
  it('lists the school’s statements with status, payment details and the outstanding total', async () => {
    renderApp({ path: '/platform-statements', as: 'owner' });
    const table = await screen.findByRole('table', { name: 'Platform statements' });
    const paid = await within(table).findByRole('row', { name: /September 2026/ });
    expect(within(paid).getByText('€84.00')).toBeTruthy();
    expect(within(paid).getByText('Paid')).toBeTruthy();
    expect(within(paid).getByText(/Bank transfer · SEPA-2026-10-05-0042/)).toBeTruthy();
    const open = within(table).getByRole('row', { name: /August 2026/ });
    expect(within(open).getByText('Issued')).toBeTruthy();
    const summary = screen.getByRole('region', { name: 'Statement totals' });
    expect(within(summary).getByText('€74.00')).toBeTruthy();
    expect(within(summary).getByText('€84.00')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /mark.*paid/i })).toBeNull();
  });

  it('filters by status and month through the URL', async () => {
    const view = renderApp({ path: '/platform-statements', as: 'owner' });
    const calls = recordQueries('/v1/platform-statements');
    await screen.findByRole('table', { name: 'Platform statements' });
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'issued');
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '2026-09' } });
    await waitFor(() =>
      expect(view.router.state.location.search).toMatchObject({
        status: 'issued',
        month: '2026-09',
      }),
    );
    await waitFor(() => {
      const last = calls.at(-1);
      expect(last?.searchParams.get('status')).toBe('issued');
      expect(last?.searchParams.get('month')).toBe('2026-09');
    });
  });

  it('is not shown to office staff', async () => {
    renderApp({ path: '/platform-statements', as: 'office' });
    expect(await screen.findByText('You do not have access to this page.')).toBeTruthy();
  });
});

describe('audit log', () => {
  it('shows actions, including support sessions with their reason', async () => {
    renderApp({ path: '/audit-log', as: 'owner' });
    const table = await screen.findByRole('table', { name: 'Audit log' });
    const row = await within(table).findByRole('row', { name: /Petra Platform/ });
    expect(within(row).getByText('students.read')).toBeTruthy();
    expect(within(row).getByText('Support session')).toBeTruthy();
    expect(within(row).getByText('Ticket 4711: student cannot see invoice')).toBeTruthy();
  });

  it('filters by action and date range through the URL', async () => {
    const view = renderApp({ path: '/audit-log', as: 'owner' });
    const calls = recordQueries('/v1/audit-log');
    await screen.findByRole('table', { name: 'Audit log' });
    await userEvent.type(screen.getByLabelText('Action'), 'students.read');
    await userEvent.type(screen.getByLabelText('From'), '2026-10-01');
    await waitFor(() =>
      expect(view.router.state.location.search).toMatchObject({
        action: 'students.read',
        from: '2026-10-01',
      }),
    );
    await waitFor(() => {
      const last = calls.at(-1);
      expect(last?.searchParams.get('action')).toBe('students.read');
      expect(last?.searchParams.get('from')).toBe('2026-09-30T22:00:00.000Z');
    });
  });

  it('is owner only', async () => {
    renderApp({ path: '/audit-log', as: 'office' });
    expect(await screen.findByText('You do not have access to this page.')).toBeTruthy();
  });
});
