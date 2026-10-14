import type { Locator, Page } from '@playwright/test';

export class LeadsPage {
  readonly table: Locator;
  readonly search: Locator;
  readonly convertDialog: Locator;

  constructor(private readonly page: Page) {
    this.table = page.getByRole('table', { name: 'Leads' });
    this.search = page.getByRole('searchbox', { name: 'Search leads' });
    this.convertDialog = page.getByRole('dialog', { name: 'Convert to student' });
  }

  statusTab(name: string): Locator {
    return this.page.getByRole('tab', { name, exact: true });
  }

  leadButton(name: string): Locator {
    return this.table.getByRole('button', { name, exact: true });
  }

  drawer(name: string): Locator {
    return this.page.getByRole('dialog', { name });
  }
}

export class PublicPageSettings {
  readonly panel: Locator;
  readonly slug: Locator;
  readonly published: Locator;
  readonly save: Locator;
  readonly preview: Locator;

  constructor(private readonly page: Page) {
    this.panel = page.getByRole('tabpanel', { name: 'Public page' });
    this.slug = this.panel.getByLabel('Page address');
    this.published = this.panel.getByRole('switch', { name: 'Published' });
    this.save = this.panel.getByRole('button', { name: 'Save page' });
    this.preview = this.panel.getByRole('link', { name: 'Open the public page' });
  }

  tab(): Locator {
    return this.page.getByRole('tab', { name: 'Public page', exact: true });
  }
}
