import { expect, test } from '../fixtures';

test('office books a lesson from a free slot and cancels it @smoke', async ({
  page,
  loginPage,
  shell,
  calendar,
}) => {
  await test.step('sign in and open the calendar', async () => {
    await loginPage.goto();
    await loginPage.signInWith('olga.office@example.com', '000000');
    await expect(shell.pageHeading).toHaveText('Dashboard');
    await shell.navLink('Calendar').click();
    await expect(shell.pageHeading).toHaveText('Calendar');
    await expect(calendar.grid).toBeVisible();
  });

  await test.step('book the free slot for Sam Schulz', async () => {
    await calendar.freeSlotsToggle.click();
    await calendar.freeSlotsPanel
      .getByLabel('Lesson type')
      .selectOption({ label: 'Standard lesson' });
    await calendar.slot(/Book Tue, Oct 13 10:00–11:00 with Ingo Instructor/).click();
    await expect(calendar.bookingDialog.getByLabel('Start time')).toHaveValue('10:00');
    await calendar.bookingDialog.getByLabel('Student', { exact: true }).selectOption({
      label: 'Sam Schulz',
    });
    await calendar.bookingDialog.getByRole('button', { name: 'Book' }).click();
    await expect(page.getByText('Lesson booked')).toBeVisible();
    await expect(calendar.bookingDialog).toBeHidden();
    await expect(page).toHaveURL(/date=2026-10-13/);
    await expect(calendar.lesson('Sam Schulz')).toHaveAttribute('data-status', 'booked');
    await expect(calendar.lesson('Sam Schulz')).toContainText('10:00–11:00');
  });

  await test.step('cancel the new lesson from its popover', async () => {
    await calendar.lesson('Sam Schulz').click();
    await page.getByRole('button', { name: 'Cancel lesson' }).click();
    await calendar.cancelDialog.getByLabel('Reason (optional)').fill('Student is ill');
    await calendar.cancelDialog.getByRole('button', { name: 'Confirm cancellation' }).click();
    await expect(page.getByText(/Lesson cancelled/)).toBeVisible();
    await expect(calendar.lesson('Sam Schulz')).toHaveAttribute('data-status', 'cancelled');
  });
});

test('owner drags a lesson one hour later with the mouse', async ({
  page,
  loginPage,
  shell,
  calendar,
}) => {
  await loginPage.goto();
  await loginPage.signInWith('otto.owner@example.com', '000000');
  await expect(shell.pageHeading).toHaveText('Dashboard');
  await page.goto('/calendar?date=2026-10-12');
  const lesson = calendar.lesson('Stella Student');
  await expect(lesson).toContainText('09:00–10:00');

  const box = await lesson.boundingBox();
  if (!box) throw new Error('The lesson block is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 40, { steps: 5 });
  await page.mouse.move(box.x + box.width / 2, box.y + 70, { steps: 5 });
  await page.mouse.up();

  await expect(page.getByText('Lesson moved')).toBeVisible();
  await expect(calendar.lesson('Stella Student')).toContainText('10:00–11:00');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancel lesson' })).toHaveCount(0);
});

test('owner shortens a lesson by dragging its bottom edge', async ({
  page,
  loginPage,
  shell,
  calendar,
}) => {
  await loginPage.goto();
  await loginPage.signInWith('otto.owner@example.com', '000000');
  await expect(shell.pageHeading).toHaveText('Dashboard');
  await page.goto('/calendar?date=2026-10-12');
  const lesson = calendar.lesson('Stella Student');
  await expect(lesson).toContainText('Standard lesson');

  const handle = calendar.grid.getByRole('button', { name: 'Change the length of this lesson' });
  const box = await handle.boundingBox();
  if (!box) throw new Error('The resize handle is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 8, { steps: 5 });
  await page.mouse.move(box.x + box.width / 2, box.y - 15, { steps: 5 });
  await page.mouse.up();

  await expect(page.getByText('Lesson moved')).toBeVisible();
  await expect(calendar.lesson('Stella Student')).toContainText('Night drive');
  await expect(calendar.lesson('Stella Student')).toContainText('09:00–09:45');
});
