import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderApp, server, startServer } from '../support/app';

beforeAll(startServer);
afterAll(() => server.close());

const rowsOf = (name: string) =>
  within(screen.getByRole('table', { name })).getAllByRole('row').slice(1);

const rowWith = (table: string, text: string) => {
  const row = rowsOf(table).find((candidate) => candidate.textContent?.includes(text));
  if (!row) throw new Error(`No row with ${text}`);
  return row;
};

describe('branches screen', () => {
  it('lists branches and adds one through the dialog', async () => {
    renderApp({ path: '/branches', as: 'owner' });
    expect(await screen.findByRole('cell', { name: 'Mitte' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Add branch' }));
    const dialog = await screen.findByRole('dialog', { name: 'New branch' });
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Kreuzberg');
    await userEvent.type(within(dialog).getByLabelText('Address'), 'Oranienstraße 1, Berlin');
    await userEvent.type(within(dialog).getByLabelText('Latitude'), '52.5');
    await userEvent.type(within(dialog).getByLabelText('Longitude'), '13.42');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('cell', { name: 'Kreuzberg' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('validates the branch form inline', async () => {
    renderApp({ path: '/branches', as: 'owner' });
    await userEvent.click(await screen.findByRole('button', { name: 'Add branch' }));
    const dialog = await screen.findByRole('dialog', { name: 'New branch' });
    await userEvent.type(within(dialog).getByLabelText('Latitude'), '123');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findAllByText('This field is required.')).toHaveLength(3);
    expect(within(dialog).getByText('The value is too large.')).toBeTruthy();
  });
});

describe('vehicles screen', () => {
  it('pages through vehicles with the cursor in the URL', async () => {
    const { history } = renderApp({ path: '/vehicles?limit=1', as: 'owner' });
    expect(await screen.findByRole('cell', { name: 'B-DS 101' })).toBeTruthy();
    expect(rowWith('Vehicles', 'B-DS 101').textContent).toContain('Mitte');
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByRole('cell', { name: 'B-DS 102' })).toBeTruthy();
    expect(history.location.search).toContain('cursor=');
    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(await screen.findByRole('cell', { name: 'B-DS 101' })).toBeTruthy();
  });

  it('deactivates a vehicle', async () => {
    renderApp({ path: '/vehicles', as: 'owner' });
    await screen.findByRole('cell', { name: 'B-DS 102' });
    await userEvent.click(
      within(rowWith('Vehicles', 'B-DS 102')).getByRole('button', { name: 'Edit' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Edit vehicle' });
    await userEvent.click(within(dialog).getByRole('switch', { name: 'Active' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(rowWith('Vehicles', 'B-DS 102').textContent).toContain('Inactive'));
  });
});

describe('price items screen', () => {
  it('shows amounts from minor units and creates an item from major units', async () => {
    const { mock } = renderApp({ path: '/price-items', as: 'owner' });
    await screen.findByRole('cell', { name: 'Single lesson' });
    expect(rowWith('Price items', 'Single lesson').textContent).toContain('€65.00');
    expect(rowWith('Price items', '10-lesson package').textContent).toContain('19%');
    await userEvent.click(screen.getByRole('button', { name: 'Add price item' }));
    const dialog = await screen.findByRole('dialog', { name: 'New price item' });
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Pre-test package');
    await userEvent.selectOptions(within(dialog).getByLabelText('Kind'), 'package');
    await userEvent.type(within(dialog).getByLabelText('Price (EUR)'), '199.99');
    await userEvent.type(within(dialog).getByLabelText('Credit minutes'), '180');
    await userEvent.type(within(dialog).getByLabelText('Tax rate (%)'), '19');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(rowWith('Price items', 'Pre-test package').textContent).toContain('€199.99'),
    );
    const created = [...mock.store.priceItems.values()].find(
      (item) => item.value.name === 'Pre-test package',
    );
    expect(created?.value).toMatchObject({ amountMinor: 19999, currency: 'EUR', taxRateBp: 1900 });
  });

  it('asks for credit minutes on lesson and package items', async () => {
    renderApp({ path: '/price-items', as: 'owner' });
    await userEvent.click(await screen.findByRole('button', { name: 'Add price item' }));
    const dialog = await screen.findByRole('dialog', { name: 'New price item' });
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Extra lesson');
    await userEvent.type(within(dialog).getByLabelText('Price (EUR)'), '65');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await within(dialog).findByText('Lessons and packages need credit minutes.'),
    ).toBeTruthy();
  });
});

describe('lesson types screen', () => {
  it('lists lesson types and lets the owner edit them', async () => {
    renderApp({ path: '/lesson-types', as: 'owner' });
    expect(await screen.findByRole('cell', { name: 'Driving exam' })).toBeTruthy();
    await userEvent.click(
      within(rowWith('Lesson types', 'Night drive')).getByRole('button', { name: 'Edit' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Edit lesson type' });
    const minutes = within(dialog).getByLabelText('Duration (minutes)');
    await userEvent.clear(minutes);
    await userEvent.type(minutes, '120');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(rowWith('Lesson types', 'Night drive').textContent).toContain('120'),
    );
  });

  it('is read-only for office staff', async () => {
    renderApp({ path: '/lesson-types', as: 'office' });
    expect(await screen.findByRole('cell', { name: 'Standard lesson' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add lesson type' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });
});

describe('staff screen', () => {
  it('lists staff and filters by role', async () => {
    renderApp({ path: '/staff', as: 'office' });
    expect(await screen.findByRole('cell', { name: 'Ingo Instructor' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Otto Owner' })).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'instructor');
    await waitFor(() => expect(screen.queryByRole('cell', { name: 'Otto Owner' })).toBeNull());
    expect(screen.getByRole('cell', { name: 'Ingo Instructor' })).toBeTruthy();
  });

  it('invites an instructor by email', async () => {
    renderApp({ path: '/staff?tab=invitations', as: 'office' });
    await userEvent.click(await screen.findByRole('button', { name: 'Invite someone' }));
    const dialog = await screen.findByRole('dialog', { name: 'New invitation' });
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Instructor' }));
    await userEvent.type(within(dialog).getByLabelText('Email'), 'nina.new@example.com');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('cell', { name: 'nina.new@example.com' })).toBeTruthy();
  });

  it('requires a student for student invitations', async () => {
    renderApp({ path: '/staff?tab=invitations', as: 'office' });
    await userEvent.click(await screen.findByRole('button', { name: 'Invite someone' }));
    const dialog = await screen.findByRole('dialog', { name: 'New invitation' });
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Student' }));
    await userEvent.type(within(dialog).getByLabelText('Phone'), '+4915550000099');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await within(dialog).findByText('Pick the student this invitation is for.'),
    ).toBeTruthy();
  });
});

describe('school settings screen', () => {
  it('loads the profile and saves booking rules', async () => {
    const { mock } = renderApp({ path: '/settings', as: 'owner' });
    expect(await screen.findByDisplayValue('Fahrschule Spree')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Booking rules' }));
    const hours = await screen.findByLabelText('Free cancellation until (hours before)');
    await userEvent.clear(hours);
    await userEvent.type(hours, '48');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(
        mock.store.settings.get('0192f000-0001-7000-8000-000000000001')?.cancellationWindowHours,
      ).toBe(48),
    );
  });

  it('rejects out-of-range booking rules inline', async () => {
    renderApp({ path: '/settings?tab=rules', as: 'owner' });
    const age = await screen.findByLabelText('Age of majority');
    await userEvent.clear(age);
    await userEvent.type(age, '30');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('The value is too large.')).toBeTruthy();
  });

  it('edits opening hours and checks opens before closes', async () => {
    renderApp({ path: '/settings?tab=hours', as: 'owner' });
    expect((await screen.findAllByLabelText('Opens')).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Add opening hours' }));
    const opens = screen.getAllByLabelText('Opens').at(-1);
    const closes = screen.getAllByLabelText('Closes').at(-1);
    if (!opens || !closes) throw new Error('missing row');
    await userEvent.clear(opens);
    await userEvent.type(opens, '18:00');
    await userEvent.clear(closes);
    await userEvent.type(closes, '09:00');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Opening time must be before closing time.')).toBeTruthy();
  });

  it('is not available to office staff', async () => {
    renderApp({ path: '/settings', as: 'office' });
    expect(await screen.findByText('You do not have access to this page.')).toBeTruthy();
  });
});
