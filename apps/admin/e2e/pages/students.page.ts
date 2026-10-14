import type { Locator, Page } from '@playwright/test';

export class StudentsPage {
  readonly table: Locator;
  readonly search: Locator;
  readonly testAttempts: Locator;
  readonly testResultDialog: Locator;

  constructor(private readonly page: Page) {
    this.table = page.getByRole('table', { name: 'Students' });
    this.search = page.getByRole('searchbox', { name: 'Search students' });
    this.testAttempts = page.getByRole('table', { name: 'Test attempts' });
    this.testResultDialog = page.getByRole('dialog', { name: 'New test result' });
  }

  studentLink(name: string): Locator {
    return this.table.getByRole('link', { name, exact: true });
  }

  tab(name: string): Locator {
    return this.page.getByRole('tab', { name, exact: true });
  }
}
