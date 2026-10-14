import { expect, test } from '../fixtures';

test('office opens a lead from the inbox and converts it into a student @smoke', async ({
  page,
  loginPage,
  shell,
  leads,
}) => {
  await test.step('sign in and open the leads inbox', async () => {
    await loginPage.goto();
    await loginPage.signInWith('olga.office@example.com', '000000');
    await expect(shell.pageHeading).toHaveText('Dashboard');
    await shell.navLink('Leads').click();
    await expect(shell.pageHeading).toHaveText('Leads');
    await expect(leads.leadButton('Lena Lead')).toBeVisible();
  });

  await test.step('the new tab keeps only new leads', async () => {
    await leads.statusTab('New').click();
    await expect(page).toHaveURL(/status=new/);
    await expect(leads.leadButton('Sam Schulz')).toBeHidden();
    await expect(leads.leadButton('Lena Lead')).toBeVisible();
  });

  await test.step('open the lead and convert it', async () => {
    await leads.leadButton('Lena Lead').click();
    const drawer = leads.drawer('Lena Lead');
    await expect(drawer.getByText('Can I start in November?')).toBeVisible();
    await drawer.getByRole('button', { name: 'Convert to student' }).click();
    await leads.convertDialog.getByLabel('Date of birth').fill('2004-05-06');
    await expect(
      leads.convertDialog.getByRole('switch', { name: 'Send the app invitation now' }),
    ).toBeChecked();
    await leads.convertDialog.getByRole('button', { name: 'Convert' }).click();
  });

  await test.step('land on the new student profile', async () => {
    await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}$/);
    await expect(shell.pageHeading).toHaveText('Lena Lead');
    await expect(page.getByLabel('Full name')).toHaveValue('Lena Lead');
  });
});

test('owner publishes the public page from settings', async ({
  page,
  loginPage,
  shell,
  publicPage,
}) => {
  await loginPage.goto();
  await loginPage.signInWith('otto.owner@example.com', '000000');
  await expect(shell.pageHeading).toHaveText('Dashboard');
  await shell.navLink('School settings').click();
  await publicPage.tab().click();
  await expect(page).toHaveURL(/tab=publicPage/);
  await expect(publicPage.slug).toHaveValue('fahrschule-spree');
  await expect(publicPage.published).toBeChecked();

  await publicPage.published.click();
  await publicPage.save.click();
  await expect(page.getByText('Public page saved.')).toBeVisible();
  await expect(publicPage.preview).toBeHidden();

  await publicPage.slug.fill('spree-berlin');
  await publicPage.published.click();
  await publicPage.save.click();
  await expect(page.getByText('Public page saved.').first()).toBeVisible();
  await expect(publicPage.preview).toHaveAttribute('href', '/s/spree-berlin');
});
