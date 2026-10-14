import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderApp, server, startServer } from '../support/app';
import { capture, STUDENTS } from '../support/students';
import { StatusCodes } from 'http-status-codes';

beforeAll(startServer);
afterEach(() => vi.restoreAllMocks());
afterAll(() => server.close());

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const profile = (tab: string, id = STUDENTS.stella) => `/students/${id}?tab=${tab}`;

describe('progress and notes', () => {
  it('shows a level bar per syllabus item', async () => {
    renderApp({ path: profile('progress'), as: 'owner' });
    const table = await screen.findByRole('table', { name: 'Syllabus progress' });
    const row = await within(table).findByRole('row', { name: /Vehicle checks and controls/ });
    const bar = within(row).getByRole('meter');
    expect(bar.getAttribute('aria-valuenow')).toBe('3');
    expect(bar.getAttribute('aria-valuemax')).toBe('5');
    const untouched = within(table).getByRole('row', { name: /Moving off and stopping/ });
    expect(within(untouched).getByText('Not started')).toBeTruthy();
    expect(screen.getByText('38 %')).toBeTruthy();
  });

  it('lists lesson notes and says private notes are not available yet', async () => {
    renderApp({ path: profile('notes'), as: 'office' });
    expect(
      await screen.findByText('Mirror checks before moving off are now routine.'),
    ).toBeTruthy();
    expect(screen.getByText('Private notes are not available yet')).toBeTruthy();
  });
});

describe('tests', () => {
  it('lists the attempts and records a new result', async () => {
    renderApp({ path: profile('tests'), as: 'office' });
    const calls = capture(
      'post',
      '*/v1/students/:id/test-attempts',
      { id: STUDENTS.document, version: 1 },
      StatusCodes.CREATED,
    );
    const table = await screen.findByRole('table', { name: 'Test attempts' });
    expect(await within(table).findByText('Passed')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Add test result' }));
    const dialog = await screen.findByRole('dialog', { name: 'New test result' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Kind'), 'practical');
    await userEvent.type(within(dialog).getByLabelText('Date'), '2026-10-07');
    await userEvent.selectOptions(within(dialog).getByLabelText('Result'), 'failed');
    await userEvent.type(within(dialog).getByLabelText('Notes'), 'Missed a give-way sign.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.url.pathname).toBe(`/v1/students/${STUDENTS.stella}/test-attempts`);
    expect(calls[0]?.body).toEqual({
      kind: 'practical',
      takenOn: '2026-10-07',
      result: 'failed',
      notes: 'Missed a give-way sign.',
    });
  });

  it('requires a date', async () => {
    renderApp({ path: profile('tests'), as: 'office' });
    await userEvent.click(await screen.findByRole('button', { name: 'Add test result' }));
    const dialog = await screen.findByRole('dialog', { name: 'New test result' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('This field is required.')).toBeTruthy();
  });
});

describe('balance', () => {
  it('shows the balance and the ledger', async () => {
    renderApp({ path: profile('balance'), as: 'office' });
    const summary = await screen.findByRole('region', { name: 'Balance' });
    expect(await within(summary).findByText('540 min')).toBeTruthy();
    const ledger = await screen.findByRole('table', { name: 'Ledger' });
    expect(await within(ledger).findByText('Purchase')).toBeTruthy();
    expect(within(ledger).getByText('Debit')).toBeTruthy();
  });

  it('posts an adjustment with an Idempotency-Key and refreshes the ledger', async () => {
    const { mock } = renderApp({ path: profile('balance'), as: 'owner' });
    const keys: string[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/v1/ledger/adjustments')) {
        keys.push(request.headers.get('Idempotency-Key') ?? '');
      }
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Adjust balance' }));
    const dialog = await screen.findByRole('dialog', { name: 'Adjust balance' });
    await userEvent.type(within(dialog).getByLabelText('Minutes'), '-30');
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Goodwill correction');
    await userEvent.type(within(dialog).getByLabelText('Note'), 'Shortened lesson on 5 Oct');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    const summary = screen.getByRole('region', { name: 'Balance' });
    expect(await within(summary).findByText('510 min')).toBeTruthy();
    server.events.removeAllListeners();
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(UUID);
    const entry = mock.store.ledger.at(-1)?.entry;
    expect(entry).toMatchObject({
      entryType: 'adjustment',
      minutes: -30,
      note: 'Shortened lesson on 5 Oct',
    });
  });
});

describe('lessons', () => {
  it('lists the lessons in the range and links to the calendar', async () => {
    renderApp({ path: `${profile('lessons')}&from=2026-10-01&to=2026-10-31`, as: 'office' });
    const table = await screen.findByRole('table', { name: 'Lessons' });
    const row = await within(table).findByRole('row', { name: /Standard lesson/ });
    expect(within(row).getByText(/Oct 12, 2026/)).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Open in calendar' });
    expect(link.getAttribute('href')).toContain(`studentId=${STUDENTS.stella}`);
  });

  it('puts the range into the URL', async () => {
    const { history } = renderApp({
      path: `${profile('lessons')}&from=2026-10-01&to=2026-10-31`,
      as: 'office',
    });
    await screen.findByRole('table', { name: 'Lessons' });
    const from = screen.getByLabelText('From');
    await userEvent.clear(from);
    await userEvent.type(from, '2026-11-01');
    await waitFor(() => expect(history.location.search).toContain('from=2026-11-01'));
  });
});

describe('documents', () => {
  it('uploads through a signed URL and completes the document', async () => {
    renderApp({ path: profile('documents'), as: 'office' });
    const uploadUrl = 'http://storage.test/bucket/doc?X-Amz-Signature=s';
    const created = capture(
      'post',
      '*/v1/documents/upload-url',
      {
        documentId: STUDENTS.document,
        uploadUrl,
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf', 'x-amz-server-side-encryption': 'AES256' },
        expiresAt: '2026-10-08T09:00:00.000Z',
      },
      StatusCodes.CREATED,
    );
    const uploaded = capture('put', 'http://storage.test/bucket/doc', null);
    const completed = capture('post', '*/v1/documents/:id/complete', {
      id: STUDENTS.document,
      version: 2,
    });
    const table = await screen.findByRole('table', { name: 'Documents' });
    expect(await within(table).findByText('Eye test')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Upload document' }));
    const dialog = await screen.findByRole('dialog', { name: 'Upload document' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Kind'), 'medical_certificate');
    const file = new File(['%PDF-1.4'], 'medical.pdf', { type: 'application/pdf' });
    await userEvent.upload(within(dialog).getByLabelText('File'), file);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(completed).toHaveLength(1));
    expect(created[0]?.body).toEqual({
      kind: 'medical_certificate',
      mime: 'application/pdf',
      sizeBytes: file.size,
      ownerStudentId: STUDENTS.stella,
    });
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]?.headers.get('x-amz-server-side-encryption')).toBe('AES256');
    expect(uploaded[0]?.body).toBe('%PDF-1.4');
    expect(completed[0]?.url.pathname).toBe(`/v1/documents/${STUDENTS.document}/complete`);
  });

  it('rejects an unsupported file type', async () => {
    renderApp({ path: profile('documents'), as: 'office' });
    await userEvent.click(await screen.findByRole('button', { name: 'Upload document' }));
    const dialog = await screen.findByRole('dialog', { name: 'Upload document' });
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    await userEvent.upload(within(dialog).getByLabelText('File'), file, { applyAccept: false });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Upload' }));
    expect(await within(dialog).findByText('Choose a PDF, JPEG, PNG or HEIC file.')).toBeTruthy();
  });

  it('downloads through a short-lived URL', async () => {
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.href);
    });
    renderApp({ path: profile('documents'), as: 'office' });
    const table = await screen.findByRole('table', { name: 'Documents' });
    await userEvent.click(await within(table).findByRole('button', { name: 'Download' }));
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(clicked[0]).toContain('X-Amz-Signature=sample-get');
  });
});

describe('contracts', () => {
  it('creates a contract from a template and shows its status and signatures', async () => {
    const { history } = renderApp({ path: profile('contracts', STUDENTS.mia), as: 'office' });
    const calls = capture(
      'post',
      '*/v1/contracts',
      { id: STUDENTS.contract, version: 1 },
      StatusCodes.CREATED,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'New contract' }));
    const dialog = await screen.findByRole('dialog', { name: 'New contract' });
    await userEvent.selectOptions(
      await within(dialog).findByLabelText('Template'),
      'Training contract (class B) v1',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({
      studentId: STUDENTS.mia,
      templateId: STUDENTS.contractTemplate,
    });
    await waitFor(() =>
      expect(history.location.search).toContain(`contractId=${STUDENTS.contract}`),
    );
    expect(await screen.findByText('Awaiting signatures')).toBeTruthy();
    const signatures = screen.getByRole('table', { name: 'Signatures' });
    expect(within(signatures).getByText('Gustav Minor')).toBeTruthy();
    expect(within(signatures).getByText('Guardian')).toBeTruthy();
  });
});

describe('guardians', () => {
  it('shows the consent status of each guardian', async () => {
    renderApp({ path: profile('guardians', STUDENTS.mia), as: 'office' });
    const table = await screen.findByRole('table', { name: 'Guardians' });
    const row = await within(table).findByRole('row', { name: /Gustav Minor/ });
    expect(within(row).getByText('Consent pending')).toBeTruthy();
  });

  it('invites a parent with the student id', async () => {
    const { mock } = renderApp({ path: profile('guardians', STUDENTS.mia), as: 'office' });
    await userEvent.click(await screen.findByRole('button', { name: 'Invite parent' }));
    const dialog = await screen.findByRole('dialog', { name: 'Invite parent' });
    await userEvent.type(within(dialog).getByLabelText('Phone'), '+4915550000077');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send invitation' }));
    await waitFor(() =>
      expect(
        [...mock.store.invitations.values()].map((record) => record.invitation),
      ).toContainEqual(
        expect.objectContaining({
          roles: ['parent'],
          studentId: STUDENTS.mia,
          phone: '+4915550000077',
        }),
      ),
    );
    const pending = await screen.findByRole('table', { name: 'Pending parent invitations' });
    expect(within(pending).getByText('+4915550000077')).toBeTruthy();
  });

  it('needs a phone or an email for the parent invitation', async () => {
    renderApp({ path: profile('guardians', STUDENTS.mia), as: 'office' });
    await userEvent.click(await screen.findByRole('button', { name: 'Invite parent' }));
    const dialog = await screen.findByRole('dialog', { name: 'Invite parent' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send invitation' }));
    expect(
      await within(dialog).findByText('Enter a phone number or an email address.'),
    ).toBeTruthy();
  });

  it('links an existing guardian account', async () => {
    renderApp({ path: profile('guardians', STUDENTS.mia), as: 'office' });
    const calls = capture(
      'post',
      '*/v1/students/:id/guardians',
      { id: STUDENTS.document, version: 1 },
      StatusCodes.CREATED,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Link existing account' }));
    const dialog = await screen.findByRole('dialog', { name: 'Link existing account' });
    await userEvent.type(within(dialog).getByLabelText('Guardian user ID'), STUDENTS.gustavUser);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ guardianUserId: STUDENTS.gustavUser });
  });
});
