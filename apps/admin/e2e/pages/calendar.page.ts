import type { Locator, Page } from '@playwright/test';

export class CalendarPage {
  readonly grid: Locator;
  readonly freeSlotsToggle: Locator;
  readonly freeSlotsPanel: Locator;
  readonly bookingDialog: Locator;
  readonly cancelDialog: Locator;

  constructor(private readonly page: Page) {
    this.grid = page.getByRole('region', { name: 'Calendar grid' });
    this.freeSlotsToggle = page.getByRole('button', { name: 'Free slots', exact: true });
    this.freeSlotsPanel = page.getByRole('complementary', { name: 'Free slots' });
    this.bookingDialog = page.getByRole('dialog', { name: 'Book a lesson' });
    this.cancelDialog = page.getByRole('dialog', { name: 'Cancel lesson' });
  }

  lesson(studentName: string): Locator {
    return this.grid.getByRole('button', { name: new RegExp(studentName) });
  }

  slot(name: RegExp): Locator {
    return this.freeSlotsPanel.getByRole('button', { name });
  }
}
