import { expect, test } from '../fixtures';
import { latestLoginCode } from './mailpit';

const OLGA = 'olga.office@example.com';
const LEAD_NAME = 'Playwright Lead';
const LEAD_PHONE = '+4915550000099';
const CLOCK_SKEW_MS = 5_000;

test('a visitor enquires on the public page and the office sees the lead in the inbox @real-api', async ({
  page,
  request,
  loginPage,
  shell,
  leads,
  schoolPage,
}) => {
  await test.step('open the seeded public page without a session', async () => {
    await schoolPage.goto('fahrschule-spree');
    await expect(schoolPage.heading).toHaveText('Fahrschule Spree');
    await expect(page).toHaveTitle('Fahrschule Spree');
  });

  await test.step('see the public prices and the approved review', async () => {
    await expect(schoolPage.prices.getByText('Single lesson')).toBeVisible();
    await expect(schoolPage.prices.getByText('10-lesson package')).toBeVisible();
    await expect(schoolPage.prices.getByText('Premium theory')).toHaveCount(0);
    await expect(schoolPage.reviews.getByText('Sam S.')).toBeVisible();
    await expect(
      schoolPage.reviews.getByText(/^Patient instructors and clear explanations\./),
    ).toBeVisible();
  });

  await test.step('send an enquiry', async () => {
    await schoolPage.fullName.fill(LEAD_NAME);
    await schoolPage.phone.fill(LEAD_PHONE);
    await schoolPage.consent.check();
    await schoolPage.send.click();
    await expect(schoolPage.thanks).toBeVisible();
  });

  await test.step('office signs in with the emailed code', async () => {
    await loginPage.goto();
    const since = new Date(Date.now() - CLOCK_SKEW_MS);
    await loginPage.contact.fill(OLGA);
    await loginPage.sendCode.click();
    await expect(loginPage.code).toBeVisible();
    let code: string | null = null;
    await expect
      .poll(async () => (code = await latestLoginCode(request, OLGA, since)), { timeout: 30_000 })
      .not.toBeNull();
    await loginPage.code.fill(code ?? '');
    await loginPage.signIn.click();
    await expect(shell.pageHeading).toHaveText('Dashboard');
  });

  await test.step('the enquiry is in the leads inbox', async () => {
    await shell.navLink('Leads').click();
    await expect(shell.pageHeading).toHaveText('Leads');
    await expect(leads.leadButton('Lea Lead')).toBeVisible();
    await leads.leadButton(LEAD_NAME).click();
    const drawer = leads.drawer(LEAD_NAME);
    await expect(drawer.getByText(LEAD_PHONE)).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
