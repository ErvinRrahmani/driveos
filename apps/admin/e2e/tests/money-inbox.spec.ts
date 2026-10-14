import { expect, test } from '../fixtures';

test('owner downloads an invoice, answers a school chat and reads the reports @smoke', async ({
  page,
  loginPage,
  shell,
  invoices,
  inbox,
  reports,
}) => {
  await test.step('sign in as the owner', async () => {
    await loginPage.goto();
    await loginPage.signInWith('otto.owner@example.com', '000000');
    await expect(shell.pageHeading).toHaveText('Dashboard');
  });

  await test.step('open invoices and download a PDF', async () => {
    await shell.navLink('Invoices').click();
    await expect(shell.pageHeading).toHaveText('Invoices');
    const invoice = invoices.row('2026-000042');
    await expect(invoice.getByText('€600.00')).toBeVisible();
    await expect(invoices.row('2026-000043').getByText('Credit note')).toBeVisible();
    const download = page.waitForEvent('download');
    await invoice.getByRole('button', { name: 'PDF' }).click();
    expect((await download).suggestedFilename()).toBe('2026-000042.pdf');
  });

  await test.step('read an instructor chat without a composer', async () => {
    await shell.navLink('Inbox').click();
    await expect(shell.pageHeading).toHaveText('Inbox');
    await inbox.conversation('With Ingo Instructor').click();
    await expect(page).toHaveURL(/conversationId=/);
    await expect(inbox.thread.getByText('Where do we meet tomorrow?')).toBeVisible();
    await expect(inbox.readOnlyNotice).toBeVisible();
    await expect(inbox.composer).toBeHidden();
  });

  await test.step('send a message in the school chat', async () => {
    await inbox.conversation('School chat').click();
    await expect(inbox.readOnlyNotice).toBeHidden();
    await inbox.composer.fill('Your exam is on Friday at 9:00.');
    await inbox.send.click();
    await expect(page.getByText('Message sent.')).toBeVisible();
    await expect(inbox.composer).toHaveValue('');
  });

  await test.step('open the reports', async () => {
    await shell.navLink('Reports').click();
    await expect(shell.pageHeading).toHaveText('Reports');
    await expect(reports.table('No-shows')).toBeVisible();
    await expect(reports.chart('No-show rate by day')).toBeVisible();
    await reports.tab('Revenue').click();
    await expect(page).toHaveURL(/tab=revenue/);
    await expect(reports.table('Revenue').getByText('€1,450.00')).toBeVisible();
    await reports.tab('Growth history').click();
    await expect(reports.table('Growth history')).toBeVisible();
  });
});
