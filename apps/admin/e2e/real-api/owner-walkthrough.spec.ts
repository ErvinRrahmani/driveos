import { expect, test } from '../fixtures';
import { latestLoginCode } from './mailpit';

const OTTO = 'otto.owner@example.com';
const DAY_MS = 86_400_000;
const CLOCK_SKEW_MS = 5_000;

test('owner signs in through Mailpit and walks the main screens against the real API @real-api', async ({
  page,
  request,
  loginPage,
  shell,
  reports,
  slotOffers,
}) => {
  await test.step('sign in with the emailed code', async () => {
    await loginPage.goto();
    const since = new Date(Date.now() - CLOCK_SKEW_MS);
    await loginPage.contact.fill(OTTO);
    await loginPage.sendCode.click();
    await expect(loginPage.code).toBeVisible();
    let code: string | null = null;
    await expect
      .poll(async () => (code = await latestLoginCode(request, OTTO, since)), { timeout: 30_000 })
      .not.toBeNull();
    await loginPage.code.fill(code ?? '');
    await loginPage.signIn.click();
    await expect(shell.pageHeading).toHaveText('Dashboard');
  });

  await test.step('dashboard shows the growth report or the neutral no-report state', async () => {
    await expect(page.getByRole('heading', { name: 'Growth report' })).toBeVisible();
    await expect(
      page
        .getByRole('status', { name: 'No report for this month yet' })
        .or(page.getByText('Late cancellations kept'))
        .first(),
    ).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  await test.step('students list shows Stella', async () => {
    await shell.navLink('Students').click();
    await expect(shell.table('Students').getByText('Stella Student')).toBeVisible();
  });

  await test.step('calendar loads', async () => {
    await shell.navLink('Calendar').click();
    await expect(shell.pageHeading).toHaveText('Calendar');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  await test.step('reports render without errors', async () => {
    await shell.navLink('Reports').click();
    await expect(shell.pageHeading).toHaveText('Reports');
    await expect(
      reports.table('No-shows').or(page.getByText('No data for this range')).first(),
    ).toBeVisible();
    await reports.tab('Growth history').click();
    await expect(reports.table('Growth history')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  await test.step('slot offers list and a manual offer round-trip', async () => {
    await shell.navLink('Slot offers').click();
    await expect(shell.pageHeading).toHaveText('Slot offers');
    await expect(
      slotOffers.offersTable.or(page.getByText('No slot offers', { exact: true })).first(),
    ).toBeVisible();
    await slotOffers.offerSlot.click();
    await slotOffers.fillOffer({
      instructor: 'Ingo Instructor',
      lessonType: 'Standard lesson',
      vehicle: 'B-DS 102',
      date: new Date(Date.now() + 7 * DAY_MS).toISOString().slice(0, 10),
      time: '10:00',
    });
    await slotOffers.save();
    await expect(
      page
        .getByText('Slot offered.')
        .or(page.getByText(/^Nobody can take this slot/))
        .or(page.getByText(/^This slot cannot be offered/))
        .first(),
    ).toBeVisible();
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
  });

  await test.step('waiting list tab loads', async () => {
    if (await slotOffers.dialog.isVisible()) await page.keyboard.press('Escape');
    await slotOffers.tab('Waiting list').click();
    await expect(
      slotOffers.waitingListTable.or(page.getByText('Nobody is waiting', { exact: true })).first(),
    ).toBeVisible();
  });
});
