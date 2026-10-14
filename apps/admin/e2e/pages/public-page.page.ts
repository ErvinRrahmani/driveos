import type { Locator, Page } from '@playwright/test';

/** The public enrolment page at `/s/$slug` (no session). */
export class PublicSchoolPage {
  readonly heading: Locator;
  readonly prices: Locator;
  readonly reviews: Locator;
  readonly form: Locator;
  readonly fullName: Locator;
  readonly phone: Locator;
  readonly consent: Locator;
  readonly send: Locator;
  readonly thanks: Locator;
  readonly notFound: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { level: 1 });
    this.prices = page.getByRole('region', { name: 'Prices' });
    this.reviews = page.getByRole('region', { name: 'Reviews' });
    this.form = page.getByRole('form', { name: 'Enrol or ask a question' });
    this.fullName = this.form.getByLabel('Full name', { exact: true });
    this.phone = this.form.getByLabel('Phone', { exact: true });
    this.consent = this.form.getByRole('checkbox', { name: /I agree/ });
    this.send = this.form.getByRole('button', { name: 'Send enquiry' });
    this.thanks = page.getByRole('heading', { name: 'Thanks, we got your enquiry' });
    this.notFound = page.getByRole('heading', { name: 'School page not found' });
  }

  async goto(slug: string): Promise<void> {
    await this.page.goto(`/s/${slug}`);
  }
}
