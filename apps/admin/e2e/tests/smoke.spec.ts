import { expect, test } from '../fixtures';

const SCREENS = [
  { link: 'School settings', heading: 'School settings', table: null, text: null },
  { link: 'Branches', heading: 'Branches', table: 'Branches', text: 'Mitte' },
  { link: 'Vehicles', heading: 'Vehicles', table: 'Vehicles', text: 'B-DS 101' },
  { link: 'Staff', heading: 'Staff', table: 'Members', text: 'Olga Office' },
  { link: 'Lesson types', heading: 'Lesson types', table: 'Lesson types', text: 'Standard lesson' },
  { link: 'Price items', heading: 'Price items', table: 'Price items', text: '€65.00' },
] as const;

const DAY_MS = 86_400_000;

test('owner signs in with a one-time code and opens every admin screen @smoke', async ({
  page,
  loginPage,
  shell,
  reports,
  slotOffers,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await test.step('a signed-out visit lands on the login page', async () => {
    await page.goto('/');
    await expect(loginPage.heading).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  await test.step('sign in as the owner', async () => {
    await loginPage.signInWith('otto.owner@example.com', '000000');
    await expect(shell.pageHeading).toHaveText('Dashboard');
    await expect(page.getByRole('heading', { name: 'Growth report' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Fahrschule Spree/ })).toBeVisible();
  });

  for (const screen of SCREENS) {
    await test.step(`open ${screen.link}`, async () => {
      await shell.navLink(screen.link).click();
      await expect(shell.pageHeading).toHaveText(screen.heading);
      if (screen.table) {
        await expect(shell.table(screen.table).getByText(screen.text)).toBeVisible();
      } else {
        await expect(page.getByLabel('School name')).toHaveValue('Fahrschule Spree');
      }
    });
  }

  await test.step('open Reports and switch the bucket', async () => {
    await shell.navLink('Reports').click();
    await expect(shell.pageHeading).toHaveText('Reports');
    await expect(reports.table('No-shows').getByRole('row').nth(1)).toBeVisible();
    await page.getByLabel('Group by').selectOption('month');
    await expect(reports.chart('No-show rate by month')).toBeVisible();
    await reports.tab('Growth history').click();
    await expect(reports.table('Growth history')).toBeVisible();
  });

  await test.step('open Slot offers and offer a slot to one student', async () => {
    await shell.navLink('Slot offers').click();
    await expect(shell.pageHeading).toHaveText('Slot offers');
    await expect(slotOffers.offersTable.getByText('Cancellation')).toBeVisible();
    await slotOffers.offerSlot.click();
    await slotOffers.fillOffer({
      instructor: 'Ingo Instructor',
      lessonType: 'Standard lesson',
      vehicle: 'B-DS 102',
      date: new Date(Date.now() + 5 * DAY_MS).toISOString().slice(0, 10),
      time: '06:30',
      students: ['Stella Student'],
    });
    await slotOffers.save();
    await expect(page.getByText('Slot offered.')).toBeVisible();
    await expect(slotOffers.dialog).toBeHidden();
    await expect(slotOffers.offersTable.getByText('Manual')).toBeVisible();
  });

  await test.step('manage the waiting list from the Slot offers page', async () => {
    await slotOffers.tab('Waiting list').click();
    await expect(slotOffers.waitingListTable.getByText('Sam Schulz')).toBeVisible();
    await slotOffers.tab('Offers').click();
    await expect(slotOffers.offersTable).toBeVisible();
  });

  await test.step('return to the dashboard', async () => {
    await shell.navLink('Dashboard').click();
    await expect(page.getByRole('heading', { name: 'Growth report' })).toBeVisible();
  });

  expect(consoleErrors).toEqual([]);
});
