import type { Locator, Page } from '@playwright/test';

export class SlotOffersPage {
  readonly offersTable: Locator;
  readonly waitingListTable: Locator;
  readonly offerSlot: Locator;
  readonly dialog: Locator;

  constructor(private readonly page: Page) {
    this.offersTable = page.getByRole('table', { name: 'Slot offers' });
    this.waitingListTable = page.getByRole('table', { name: 'Waiting list' });
    this.offerSlot = page.getByRole('button', { name: 'Offer a slot' });
    this.dialog = page.getByRole('dialog', { name: 'New slot offer' });
  }

  tab(name: 'Offers' | 'Waiting list'): Locator {
    return this.page.getByRole('tab', { name, exact: true });
  }

  async fillOffer(offer: {
    instructor: string;
    lessonType: string;
    vehicle: string;
    date: string;
    time: string;
    students?: string[];
  }): Promise<void> {
    await this.dialog.getByLabel('Instructor').selectOption({ label: offer.instructor });
    await this.dialog.getByLabel('Lesson type').selectOption({ label: offer.lessonType });
    await this.dialog.getByLabel('Vehicle').selectOption({ label: offer.vehicle });
    await this.dialog.getByLabel('Date').fill(offer.date);
    await this.dialog.getByLabel('Start time').fill(offer.time);
    const group = this.dialog.getByRole('group', { name: 'Offer only to these students' });
    for (const student of offer.students ?? []) {
      await group.getByRole('checkbox', { name: student }).check();
    }
  }

  save(): Promise<void> {
    return this.dialog.getByRole('button', { name: 'Save' }).click();
  }
}
