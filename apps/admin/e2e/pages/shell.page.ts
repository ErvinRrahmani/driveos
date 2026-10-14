import type { Locator, Page } from '@playwright/test';

export class AdminShell {
  readonly nav: Locator;
  readonly pageHeading: Locator;

  constructor(private readonly page: Page) {
    this.nav = page.getByRole('navigation', { name: 'Main navigation' });
    this.pageHeading = page.getByRole('heading', { level: 1 });
  }

  navLink(name: string): Locator {
    return this.nav.getByRole('link', { name, exact: true });
  }

  table(name: string): Locator {
    return this.page.getByRole('table', { name });
  }
}
