import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderApp, server, startServer } from '../support/app';
import { capture, openTab, STUDENTS } from '../support/students';
import { StatusCodes } from 'http-status-codes';

beforeAll(startServer);
afterEach(() => vi.restoreAllMocks());
afterAll(() => server.close());

const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
afterEach(() => {
  URL.createObjectURL = original.create;
  URL.revokeObjectURL = original.revoke;
});

const commandResult = (id: string) => ({ id, version: 2 });

async function header(name: string) {
  return screen.findByRole('heading', { level: 1, name });
}

describe('student profile overview', () => {
  it('shows the details, a minor badge from the date of birth, enrolments and instructors', async () => {
    renderApp({ path: `/students/${STUDENTS.mia}`, as: 'owner' });
    await header('Mia Minor');
    expect(await screen.findByText('Minor')).toBeTruthy();
    expect((screen.getByLabelText('Full name') as HTMLInputElement).value).toBe('Mia Minor');
    const enrolments = screen.getByRole('table', { name: 'Enrolments' });
    expect(within(enrolments).getByText('Class B course')).toBeTruthy();
    const assigned = await screen.findByRole('group', { name: 'Assigned instructors' });
    expect(
      (within(assigned).getByRole('checkbox', { name: 'Ingo Instructor' }) as HTMLButtonElement)
        .dataset.state,
    ).toBe('checked');
  });

  it('does not show the minor badge for an adult', async () => {
    renderApp({ path: `/students/${STUDENTS.stella}`, as: 'owner' });
    await header('Stella Student');
    expect(screen.queryByText('Minor')).toBeNull();
  });

  it('saves edited details with PATCH', async () => {
    const { mock } = renderApp({ path: `/students/${STUDENTS.stella}`, as: 'office' });
    await header('Stella Student');
    const area = screen.getByLabelText('Area');
    await userEvent.clear(area);
    await userEvent.type(area, 'Friedrichshain');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(mock.store.students.get(STUDENTS.stella)?.value.area).toBe('Friedrichshain'),
    );
  });

  it('adds an enrolment', async () => {
    renderApp({ path: `/students/${STUDENTS.stella}`, as: 'office' });
    const calls = capture(
      'post',
      '*/v1/students/:id/enrolments',
      commandResult(STUDENTS.stella),
      StatusCodes.CREATED,
    );
    await header('Stella Student');
    await userEvent.click(screen.getByRole('button', { name: 'Add enrolment' }));
    const dialog = await screen.findByRole('dialog', { name: 'New enrolment' });
    await userEvent.type(within(dialog).getByLabelText('Course name'), 'Class A course');
    await userEvent.clear(within(dialog).getByLabelText('Licence class'));
    await userEvent.type(within(dialog).getByLabelText('Licence class'), 'A');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ courseName: 'Class A course', licenceClass: 'A' });
  });

  it('replaces the instructor assignment with PUT', async () => {
    renderApp({ path: `/students/${STUDENTS.stella}`, as: 'owner' });
    server.use(
      http.get('*/v1/staff', () =>
        HttpResponse.json({
          items: [
            {
              membershipId: STUDENTS.ingo,
              userId: STUDENTS.stellaUser,
              fullName: 'Ingo Instructor',
              phone: null,
              email: null,
              roles: ['instructor'],
              status: 'active',
            },
            {
              membershipId: STUDENTS.ines,
              userId: STUDENTS.gustavUser,
              fullName: 'Ida Instructor',
              phone: null,
              email: null,
              roles: ['instructor'],
              status: 'active',
            },
          ],
          nextCursor: null,
        }),
      ),
    );
    const calls = capture('put', '*/v1/students/:id/instructors', { items: [] });
    await header('Stella Student');
    const assigned = await screen.findByRole('group', { name: 'Assigned instructors' });
    await userEvent.click(
      await within(assigned).findByRole('checkbox', { name: 'Ida Instructor' }),
    );
    await userEvent.selectOptions(screen.getByLabelText('Primary instructor'), 'Ida Instructor');
    await userEvent.click(screen.getByRole('button', { name: 'Save instructors' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({
      instructors: [
        { instructorMembershipId: STUDENTS.ingo, isPrimary: false },
        { instructorMembershipId: STUDENTS.ines, isPrimary: true },
      ],
    });
  });

  it('invites the student to the app', async () => {
    const { mock } = renderApp({
      path: `/students/${STUDENTS.sam}`,
      as: 'office',
      configure: (api) => {
        const sam = api.store.students.get(STUDENTS.sam);
        if (sam) sam.value = { ...sam.value, userId: null };
      },
    });
    await header('Sam Schulz');
    expect(await screen.findByText('Not invited to the app yet.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Invite to the app' }));
    const dialog = await screen.findByRole('dialog', { name: 'Invite student' });
    expect((within(dialog).getByLabelText('Email') as HTMLInputElement).value).toBe(
      'sam.schulz@example.com',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send invitation' }));
    await waitFor(() =>
      expect(
        [...mock.store.invitations.values()].map((record) => record.invitation),
      ).toContainEqual(
        expect.objectContaining({
          roles: ['student'],
          studentId: STUDENTS.sam,
          email: 'sam.schulz@example.com',
        }),
      ),
    );
    expect(
      await screen.findByText('Invitation sent to sam.schulz@example.com, not accepted yet.'),
    ).toBeTruthy();
  });
});

describe('export, archive and anonymize', () => {
  function captureDownloads() {
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return `blob:export-${String(blobs.length)}`;
    });
    URL.revokeObjectURL = vi.fn();
    const downloads: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push({ href: this.href, download: this.download });
    });
    return { blobs, downloads };
  }

  async function confirmExport() {
    await header('Stella Student');
    await userEvent.click(screen.getByRole('button', { name: 'Export data' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Export student data' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Export' }));
  }

  it('downloads the bundle as JSON and the PDF after confirmation', async () => {
    const { blobs, downloads } = captureDownloads();
    renderApp({ path: `/students/${STUDENTS.stella}`, as: 'office' });
    const bundle = { exportedAt: '2026-10-08T09:00:00.000Z', student: { id: STUDENTS.stella } };
    const calls = capture('post', '*/v1/students/:id/export', {
      bundle,
      pdfBase64: btoa('%PDF-1.4 stella %%EOF'),
    });
    await confirmExport();
    await waitFor(() =>
      expect(downloads).toEqual([
        { href: 'blob:export-1', download: 'stella-student-export.json' },
        { href: 'blob:export-2', download: 'stella-student-export.pdf' },
      ]),
    );
    expect(calls[0]?.url.pathname).toBe(`/v1/students/${STUDENTS.stella}/export`);
    expect(blobs[0]?.type).toBe('application/json');
    expect(JSON.parse((await blobs[0]?.text()) ?? '')).toEqual(bundle);
    expect(blobs[1]?.type).toBe('application/pdf');
    expect(await blobs[1]?.text()).toBe('%PDF-1.4 stella %%EOF');
    expect(await screen.findByText('Export downloaded as JSON and PDF.')).toBeTruthy();
    expect(screen.queryByRole('alertdialog', { name: 'Export student data' })).toBeNull();
  });

  it('downloads both files from the default mock response', async () => {
    const { blobs, downloads } = captureDownloads();
    renderApp({ path: `/students/${STUDENTS.stella}`, as: 'office' });
    await confirmExport();
    await waitFor(() =>
      expect(downloads.map((entry) => entry.download)).toEqual([
        'stella-student-export.json',
        'stella-student-export.pdf',
      ]),
    );
    expect(JSON.parse((await blobs[0]?.text()) ?? '')).toHaveProperty('exportedAt');
    expect(await blobs[1]?.text()).toContain('%PDF');
  });

  it('archives after confirmation', async () => {
    renderApp({ path: `/students/${STUDENTS.stella}`, as: 'office' });
    const calls = capture('post', '*/v1/students/:id/archive', commandResult(STUDENTS.stella));
    await header('Stella Student');
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Archive student' });
    await userEvent.type(within(dialog).getByLabelText('Reason (optional)'), 'Passed');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ reason: 'Passed' });
  });

  it('anonymizes only after the full name is typed', async () => {
    const { history } = renderApp({ path: `/students/${STUDENTS.stella}`, as: 'owner' });
    const calls = capture('delete', '*/v1/students/:id', commandResult(STUDENTS.stella));
    await header('Stella Student');
    await userEvent.click(screen.getByRole('button', { name: 'Anonymize' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Anonymize student' });
    const confirm = within(dialog).getByRole('button', { name: 'Anonymize' });
    const input = within(dialog).getByLabelText(/Type Stella Student to confirm/);
    await userEvent.type(input, 'Stella');
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(input, ' student');
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(confirm);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.url.pathname).toBe(`/v1/students/${STUDENTS.stella}`);
    await waitFor(() => expect(history.location.pathname).toBe('/students'));
  });

  it('hides anonymize from office staff but keeps export', async () => {
    renderApp({ path: `/students/${STUDENTS.stella}`, as: 'office' });
    await header('Stella Student');
    expect(screen.getByRole('button', { name: 'Export data' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Anonymize' })).toBeNull();
  });

  it('shows every tab to the owner', async () => {
    renderApp({ path: `/students/${STUDENTS.stella}`, as: 'owner' });
    await header('Stella Student');
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Overview',
      'Progress',
      'Notes',
      'Tests',
      'Balance',
      'Lessons',
      'Documents',
      'Contracts',
      'Guardians',
    ]);
  });

  it('keeps the selected tab in the URL', async () => {
    const { history } = renderApp({ path: `/students/${STUDENTS.stella}`, as: 'owner' });
    await header('Stella Student');
    await openTab('Balance');
    await waitFor(() => expect(history.location.search).toContain('tab=balance'));
  });
});
