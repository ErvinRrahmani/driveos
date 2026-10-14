import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderApp, server, startServer } from '../support/app';
import { STUDENTS } from '../support/students';

beforeAll(startServer);
afterAll(() => server.close());

describe('students list', () => {
  it('is in the navigation and lists the school students', async () => {
    renderApp({ path: '/', as: 'office' });
    const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
    await userEvent.click(within(nav).getByRole('link', { name: 'Students' }));
    const table = await screen.findByRole('table', { name: 'Students' });
    const stella = await within(table).findByRole('row', { name: /Stella Student/ });
    expect(within(stella).getByText('Ingo Instructor')).toBeTruthy();
    expect(within(stella).getByText('540 min')).toBeTruthy();
    expect(within(table).getByRole('link', { name: 'Mia Minor' }).getAttribute('href')).toBe(
      `/students/${STUDENTS.mia}`,
    );
  });

  it('puts the search text into the URL and filters the rows', async () => {
    const { history } = renderApp({ path: '/students', as: 'owner' });
    const table = await screen.findByRole('table', { name: 'Students' });
    await within(table).findByText('Stella Student');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search students' }), 'sam');
    await waitFor(() => expect(history.location.search).toContain('q=sam'));
    await waitFor(() => expect(within(table).queryByText('Stella Student')).toBeNull());
    expect(within(table).getByText('Sam Schulz')).toBeTruthy();
  });

  it('filters by status and instructor through the URL', async () => {
    const { history } = renderApp({ path: '/students', as: 'owner' });
    await screen.findByRole('table', { name: 'Students' });
    await userEvent.selectOptions(await screen.findByLabelText('Instructor'), 'Ingo Instructor');
    await waitFor(() => expect(history.location.search).toContain(`instructorId=${STUDENTS.ingo}`));
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'archived');
    await waitFor(() => expect(history.location.search).toContain('status=archived'));
    expect(await screen.findByText('No students found')).toBeTruthy();
  });

  it('reads the filters from the URL', async () => {
    renderApp({ path: '/students?q=mia', as: 'owner' });
    const table = await screen.findByRole('table', { name: 'Students' });
    await within(table).findByText('Mia Minor');
    expect(within(table).queryByText('Stella Student')).toBeNull();
    expect(
      (screen.getByRole('searchbox', { name: 'Search students' }) as HTMLInputElement).value,
    ).toBe('mia');
  });
});

describe('create student', () => {
  it('validates the required fields', async () => {
    renderApp({ path: '/students', as: 'office' });
    await userEvent.click(await screen.findByRole('button', { name: 'Add student' }));
    const dialog = await screen.findByRole('dialog', { name: 'New student' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findAllByText('This field is required.')).toHaveLength(2);
  });

  it('creates the student and opens the profile', async () => {
    const { history, mock } = renderApp({ path: '/students', as: 'office' });
    await userEvent.click(await screen.findByRole('button', { name: 'Add student' }));
    const dialog = await screen.findByRole('dialog', { name: 'New student' });
    await userEvent.type(within(dialog).getByLabelText('Full name'), 'Selin Sommer');
    await userEvent.type(within(dialog).getByLabelText('Date of birth'), '2008-03-14');
    await userEvent.type(within(dialog).getByLabelText('Area'), 'Mitte');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(history.location.pathname).toMatch(/^\/students\/[0-9a-f-]{36}$/));
    const id = history.location.pathname.split('/').pop() ?? '';
    const created = mock.store.students.get(id)?.value;
    expect(created).toMatchObject({
      fullName: 'Selin Sommer',
      dateOfBirth: '2008-03-14',
      licenceClass: 'B',
      examLanguage: 'en',
      area: 'Mitte',
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Selin Sommer' })).toBeTruthy();
  });
});
