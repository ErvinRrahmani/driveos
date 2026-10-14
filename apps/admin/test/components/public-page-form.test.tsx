import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderApp, server, startServer } from '../support/app';

beforeAll(startServer);
afterEach(() => server.events.removeAllListeners());
afterAll(() => server.close());

const BERLIN = '0192f000-0001-7000-8000-000000000001';
const LISBON = '0192f000-0001-7000-8000-000000000002';
const PENDING_REVIEW = '0192f000-0120-7000-8000-000000000002';
const SINGLE_LESSON = '0192f000-000c-7000-8000-000000000001';

function recordBodies(method: string, pathname: string): Promise<unknown>[] {
  const bodies: Promise<unknown>[] = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method === method && new URL(request.url).pathname === pathname) {
      bodies.push(request.clone().json());
    }
  });
  return bodies;
}

async function openPublicPage() {
  return screen.findByRole('tabpanel', { name: 'Public page' });
}

describe('public page settings', () => {
  it('shows the empty form when the school has not saved a profile yet', async () => {
    renderApp({
      path: '/settings?tab=publicPage',
      as: 'owner',
      configure: (mock) => mock.store.publicProfiles.clear(),
    });
    const panel = await openPublicPage();
    const slug = await within(panel).findByLabelText('Page address');
    expect((slug as HTMLInputElement).value).toBe('');
    expect(
      within(panel).getByRole('switch', { name: 'Published' }).getAttribute('aria-checked'),
    ).toBe('false');
    expect(within(panel).queryByRole('link', { name: 'Open the public page' })).toBeNull();
  });

  it('saves the profile with a PUT of every field', async () => {
    const bodies = recordBodies('PUT', '/v1/school/public-profile');
    const { mock } = renderApp({
      path: '/settings?tab=publicPage',
      as: 'owner',
      configure: (mock) => mock.store.publicProfiles.clear(),
    });
    const panel = await openPublicPage();
    await userEvent.type(await within(panel).findByLabelText('Page address'), 'spree-drive');
    await userEvent.type(within(panel).getByLabelText('Headline'), 'Drive in Mitte');
    await userEvent.type(within(panel).getByLabelText('WhatsApp number'), '+4915550000002');
    await userEvent.click(within(panel).getByRole('switch', { name: 'Published' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Save page' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(await bodies[0]).toEqual({
      slug: 'spree-drive',
      published: true,
      headline: 'Drive in Mitte',
      description: null,
      phone: null,
      whatsappNumber: '+4915550000002',
      instagramUrl: null,
      facebookUrl: null,
      externalReviewUrl: null,
      showPrices: true,
      showInstructors: true,
    });
    await waitFor(() =>
      expect(mock.store.publicProfiles.get(BERLIN)).toMatchObject({ slug: 'spree-drive' }),
    );
    const preview = await within(panel).findByRole('link', { name: 'Open the public page' });
    expect(preview.getAttribute('href')).toBe('/s/spree-drive');
  });

  it('shows slug_taken as a field error', async () => {
    renderApp({
      path: '/settings?tab=publicPage',
      as: 'owner',
      configure: (mock) => {
        const berlin = mock.store.publicProfiles.get(BERLIN);
        if (berlin) mock.store.publicProfiles.set(LISBON, { ...berlin, slug: 'escola-tejo' });
      },
    });
    const panel = await openPublicPage();
    const slug = await within(panel).findByLabelText('Page address');
    await waitFor(() => expect((slug as HTMLInputElement).value).toBe('fahrschule-spree'));
    await userEvent.clear(slug);
    await userEvent.type(slug, 'escola-tejo');
    await userEvent.click(within(panel).getByRole('button', { name: 'Save page' }));
    expect(
      await within(panel).findByText('This address is already taken. Try another one.'),
    ).toBeTruthy();
    expect(slug.getAttribute('aria-invalid')).toBe('true');
  });

  it('rejects an invalid slug before saving', async () => {
    const bodies = recordBodies('PUT', '/v1/school/public-profile');
    renderApp({ path: '/settings?tab=publicPage', as: 'owner' });
    const panel = await openPublicPage();
    const slug = await within(panel).findByLabelText('Page address');
    await waitFor(() => expect((slug as HTMLInputElement).value).toBe('fahrschule-spree'));
    await userEvent.clear(slug);
    await userEvent.type(slug, 'Bad Slug!');
    await userEvent.click(within(panel).getByRole('button', { name: 'Save page' }));
    expect(
      await within(panel).findByText('Use 3–40 lower-case letters, digits and hyphens.'),
    ).toBeTruthy();
    expect(bodies).toHaveLength(0);
  });

  it('shows the upgrade notice instead of the form without the plan feature', async () => {
    renderApp({
      path: '/settings?tab=publicPage',
      as: 'owner',
      configure: (mock) => {
        for (const plan of mock.store.plans.values()) plan.value.features = [];
      },
    });
    const panel = await openPublicPage();
    expect(await within(panel).findByText(/Upgrade your plan/)).toBeTruthy();
    expect(within(panel).queryByLabelText('Page address')).toBeNull();
  });

  it('toggles a price item onto the public page', async () => {
    const { mock } = renderApp({ path: '/settings?tab=publicPage', as: 'owner' });
    const panel = await openPublicPage();
    const toggle = await within(panel).findByRole('switch', {
      name: 'Show Premium theory on the public page',
    });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await userEvent.click(toggle);
    await waitFor(() =>
      expect(
        [...mock.store.priceItems.values()].find(
          (item) => item.value.name === 'Premium theory' && item.schoolId === BERLIN,
        )?.value.showOnPublicPage,
      ).toBe(true),
    );
    expect(mock.store.priceItems.get(SINGLE_LESSON)?.value.showOnPublicPage).toBe(true);
  });

  it('approves a pending review', async () => {
    const { mock } = renderApp({ path: '/settings?tab=publicPage', as: 'owner' });
    const panel = await openPublicPage();
    const table = await within(panel).findByRole('table', { name: 'Reviews' });
    const row = await within(table).findByRole('row', { name: /Sam S\./ });
    expect(within(row).getByText('Pending')).toBeTruthy();
    await userEvent.click(within(row).getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(mock.store.reviews.get(PENDING_REVIEW)?.value.status).toBe('approved'),
    );
    expect(await within(row).findByText('Approved')).toBeTruthy();
  });
});
