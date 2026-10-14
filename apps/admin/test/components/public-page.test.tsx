import { StatusCodes } from 'http-status-codes';
import { http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { API_BASE, renderApp, server, startServer } from '../support/app';

beforeAll(startServer);
afterEach(() => server.events.removeAllListeners());
afterAll(() => server.close());

const PAGE = '/s/fahrschule-spree';
const LEADS_PATH = '/v1/public/schools/fahrschule-spree/leads';

interface Recorded {
  body: Promise<unknown>;
  authorization: string | null;
}

function recordRequests(method: string, pathname: string): Recorded[] {
  const requests: Recorded[] = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method === method && new URL(request.url).pathname === pathname) {
      requests.push({
        body: request.clone().json(),
        authorization: request.headers.get('authorization'),
      });
    }
  });
  return requests;
}

async function enquiryForm() {
  return screen.findByRole('form', { name: 'Enrol or ask a question' });
}

async function fillContact(form: HTMLElement) {
  await userEvent.type(within(form).getByLabelText('Full name'), 'Nina Neu');
  await userEvent.type(within(form).getByLabelText('Phone'), '+4915550000099');
}

describe('public enrolment page', () => {
  it('shows the school, prices, instructors and reviews without a session', async () => {
    renderApp({ path: PAGE });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Fahrschule Spree' }),
    ).toBeDefined();
    expect(document.title).toBe('Fahrschule Spree');
    expect(screen.getByText('Learn to drive in Berlin Mitte')).toBeDefined();

    const hours = screen.getByRole('region', { name: 'Opening hours' });
    expect(within(hours).getByText('Monday')).toBeDefined();
    expect(within(hours).getByText('08:00–20:00')).toBeDefined();

    expect(screen.getByRole('link', { name: 'Message us on WhatsApp' }).getAttribute('href')).toBe(
      'https://wa.me/4915550000002',
    );
    expect(screen.getByRole('link', { name: 'Call +4930555000100' }).getAttribute('href')).toBe(
      'tel:+4930555000100',
    );

    const prices = screen.getByRole('region', { name: 'Prices' });
    expect(within(prices).getByText('Single lesson')).toBeDefined();
    expect(within(prices).getByText('€65.00')).toBeDefined();
    expect(within(prices).getByText('10-lesson package')).toBeDefined();
    expect(within(prices).queryByText('Premium theory')).toBeNull();

    const instructors = screen.getByRole('region', { name: 'Our instructors' });
    expect(within(instructors).getByText('Ingo Instructor')).toBeDefined();

    const reviews = screen.getByRole('region', { name: 'Reviews' });
    expect(within(reviews).getByText('5.0 / 5')).toBeDefined();
    expect(within(reviews).getByText('1 review')).toBeDefined();
    expect(within(reviews).getByText('Patient instructors and easy booking.')).toBeDefined();
    expect(within(reviews).getByText('Stella S.')).toBeDefined();
    expect(within(reviews).queryByText('Sam S.')).toBeNull();
    expect(
      within(reviews).getByRole('link', { name: 'See more reviews' }).getAttribute('href'),
    ).toBe('https://maps.google.com/?cid=1234567890');
  });

  it('shows the not-found state for an unknown slug', async () => {
    renderApp({ path: '/s/nope' });
    expect(await screen.findByRole('heading', { name: 'School page not found' })).toBeDefined();
    expect(screen.queryByRole('form')).toBeNull();
  });

  it('posts the enquiry with the consent version and shows the thanks state', async () => {
    const requests = recordRequests('POST', LEADS_PATH);
    const { mock } = renderApp({ path: PAGE });
    const form = await enquiryForm();
    await fillContact(form);
    await userEvent.type(within(form).getByLabelText('Message (optional)'), 'Weekend lessons?');
    await userEvent.click(within(form).getByRole('checkbox', { name: /I agree/ }));
    await userEvent.click(within(form).getByRole('button', { name: 'Send enquiry' }));

    expect(
      await screen.findByRole('heading', { name: 'Thanks, we got your enquiry' }),
    ).toBeDefined();
    expect(screen.queryByRole('form')).toBeNull();
    expect(requests).toHaveLength(1);
    expect(await requests[0]?.body).toEqual({
      fullName: 'Nina Neu',
      phone: '+4915550000099',
      licenceClass: 'B',
      message: 'Weekend lessons?',
      isMinor: false,
      consentTextVersion: 'lead-consent.v1',
    });
    const lead = [...mock.store.leads.values()].find(
      (record) => record.value.fullName === 'Nina Neu',
    );
    expect(lead?.value).toMatchObject({ source: 'page', status: 'new', isMinor: false });
  });

  it('never sends the staff bearer token from the public page', async () => {
    const requests = recordRequests('POST', LEADS_PATH);
    renderApp({ path: PAGE, as: 'owner' });
    const form = await enquiryForm();
    await fillContact(form);
    await userEvent.click(within(form).getByRole('checkbox', { name: /I agree/ }));
    await userEvent.click(within(form).getByRole('button', { name: 'Send enquiry' }));
    await screen.findByRole('heading', { name: 'Thanks, we got your enquiry' });
    expect(requests[0]?.authorization).toBeNull();
  });

  it('requires the guardian fields and the consent for a minor', async () => {
    const requests = recordRequests('POST', LEADS_PATH);
    renderApp({ path: PAGE });
    const form = await enquiryForm();
    expect(within(form).queryByRole('textbox', { name: 'Parent or guardian name' })).toBeNull();
    await fillContact(form);
    await userEvent.click(within(form).getByRole('checkbox', { name: /The learner is a minor/ }));
    expect(within(form).getByRole('textbox', { name: 'Parent or guardian name' })).toBeDefined();
    await userEvent.click(within(form).getByRole('button', { name: 'Send enquiry' }));

    expect((await within(form).findByRole('alert')).textContent).toBe(
      'Check the highlighted fields and send again.',
    );
    expect(within(form).getAllByText('This field is required.')).toHaveLength(2);
    expect(within(form).getByText('Accept the consent to send your enquiry.')).toBeDefined();
    expect(requests).toHaveLength(0);

    await userEvent.type(within(form).getByLabelText('Parent or guardian name'), 'Nora Neu');
    await userEvent.type(
      within(form).getByLabelText('Parent or guardian phone or email'),
      'nora.neu@example.com',
    );
    await userEvent.click(within(form).getByRole('checkbox', { name: /I agree/ }));
    await userEvent.click(within(form).getByRole('button', { name: 'Send enquiry' }));
    await screen.findByRole('heading', { name: 'Thanks, we got your enquiry' });
    expect(await requests[0]?.body).toMatchObject({
      isMinor: true,
      guardianName: 'Nora Neu',
      guardianContact: 'nora.neu@example.com',
      consentTextVersion: 'lead-consent.v1',
    });
  });

  it('shows every missing field at once, guardian fields included', async () => {
    renderApp({ path: PAGE, strict: true });
    const form = await enquiryForm();
    await userEvent.click(within(form).getByRole('checkbox', { name: /The learner is a minor/ }));
    await userEvent.click(within(form).getByRole('button', { name: 'Send enquiry' }));
    await within(form).findByText('Check the highlighted fields and send again.');
    for (const label of [
      'Full name',
      'Parent or guardian name',
      'Parent or guardian phone or email',
    ]) {
      expect([label, within(form).getByLabelText(label).getAttribute('aria-invalid')]).toEqual([
        label,
        'true',
      ]);
    }
    expect(within(form).getByLabelText('Phone').getAttribute('aria-invalid')).toBe('true');
  });

  it('keeps the honeypot field away from people and screen readers', async () => {
    renderApp({ path: PAGE });
    const form = await enquiryForm();
    const honeypot = form.querySelector<HTMLInputElement>('input[name="website"]');
    expect(honeypot).not.toBeNull();
    expect(honeypot?.tabIndex).toBe(-1);
    expect(honeypot?.getAttribute('autocomplete')).toBe('off');
    expect(honeypot?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(honeypot?.closest('[style*="display: none"]')).toBeNull();
    const names = within(form)
      .getAllByRole('textbox')
      .map((input) => input.getAttribute('name'));
    expect(names).not.toContain('website');
  });

  it('maps server field issues onto the fields', async () => {
    renderApp({ path: PAGE });
    server.use(
      http.post(`${API_BASE}${LEADS_PATH}`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation_error',
              message: 'The request is invalid.',
              details: [{ path: ['phone'], message: 'This number cannot receive messages' }],
            },
          },
          { status: StatusCodes.BAD_REQUEST },
        ),
      ),
    );
    const form = await enquiryForm();
    await fillContact(form);
    await userEvent.click(within(form).getByRole('checkbox', { name: /I agree/ }));
    await userEvent.click(within(form).getByRole('button', { name: 'Send enquiry' }));
    expect(await within(form).findByText('This number cannot receive messages')).toBeDefined();
    expect(within(form).getByLabelText('Phone').getAttribute('aria-invalid')).toBe('true');
  });

  it('asks the visitor to try again later when rate limited', async () => {
    renderApp({ path: PAGE });
    server.use(
      http.post(`${API_BASE}${LEADS_PATH}`, () =>
        HttpResponse.json(
          { error: { code: 'rate_limited', message: 'Too many requests.' } },
          { status: StatusCodes.TOO_MANY_REQUESTS },
        ),
      ),
    );
    const form = await enquiryForm();
    await fillContact(form);
    await userEvent.click(within(form).getByRole('checkbox', { name: /I agree/ }));
    await userEvent.click(within(form).getByRole('button', { name: 'Send enquiry' }));
    const alert = await within(form).findByRole('alert');
    await waitFor(() => expect(alert.textContent).toMatch(/try again later/));
    expect(screen.queryByRole('heading', { name: 'Thanks, we got your enquiry' })).toBeNull();
  });
});
