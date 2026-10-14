import { expect, test } from '../fixtures';

test('a visitor reads the public page and sends an enquiry without signing in @smoke', async ({
  page,
  schoolPage,
}) => {
  await test.step('open the page with no session', async () => {
    await schoolPage.goto('fahrschule-spree');
    await expect(schoolPage.heading).toHaveText('Fahrschule Spree');
    await expect(page).toHaveTitle('Fahrschule Spree');
    await expect(page).toHaveURL(/\/s\/fahrschule-spree$/);
  });

  await test.step('see prices and reviews', async () => {
    await expect(schoolPage.prices.getByText('Single lesson')).toBeVisible();
    await expect(schoolPage.prices.getByText('€65.00')).toBeVisible();
    await expect(
      schoolPage.reviews.getByText('Patient instructors and easy booking.'),
    ).toBeVisible();
    await expect(schoolPage.reviews.getByText('5.0 / 5')).toBeVisible();
  });

  await test.step('send the enquiry and see the thanks state', async () => {
    await schoolPage.fullName.fill('Nina Neu');
    await schoolPage.phone.fill('+4915550000099');
    await schoolPage.consent.check();
    await schoolPage.send.click();
    await expect(schoolPage.thanks).toBeVisible();
    await expect(schoolPage.form).toBeHidden();
  });
});

test('an unknown slug shows the not-found state', async ({ schoolPage }) => {
  await schoolPage.goto('nope');
  await expect(schoolPage.notFound).toBeVisible();
  await expect(schoolPage.form).toBeHidden();
});
