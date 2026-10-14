import { expect, test } from '../fixtures';

test('office finds a student, opens the profile and records a test result @smoke', async ({
  page,
  loginPage,
  shell,
  students,
}) => {
  await test.step('sign in and open the students list', async () => {
    await loginPage.goto();
    await loginPage.signInWith('olga.office@example.com', '000000');
    await expect(shell.pageHeading).toHaveText('Dashboard');
    await shell.navLink('Students').click();
    await expect(shell.pageHeading).toHaveText('Students');
    await expect(students.studentLink('Stella Student')).toBeVisible();
  });

  await test.step('search narrows the list and lands in the URL', async () => {
    await students.search.fill('sam');
    await expect(page).toHaveURL(/q=sam/);
    await expect(students.studentLink('Stella Student')).toBeHidden();
    await expect(students.studentLink('Sam Schulz')).toBeVisible();
  });

  await test.step('open the profile', async () => {
    await students.studentLink('Sam Schulz').click();
    await expect(shell.pageHeading).toHaveText('Sam Schulz');
    await expect(page.getByLabel('Full name')).toHaveValue('Sam Schulz');
  });

  await test.step('add a test attempt', async () => {
    await students.tab('Tests').click();
    await expect(page).toHaveURL(/tab=tests/);
    await expect(students.testAttempts).toBeVisible();
    await page.getByRole('button', { name: 'Add test result' }).click();
    await students.testResultDialog.getByLabel('Kind').selectOption('practical');
    await students.testResultDialog.getByLabel('Date').fill('2026-10-07');
    await students.testResultDialog.getByLabel('Result').selectOption('failed');
    await students.testResultDialog.getByLabel('Notes').fill('Missed a give-way sign.');
    await students.testResultDialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Test result saved.')).toBeVisible();
    await expect(students.testResultDialog).toBeHidden();
  });
});
