import { test as base } from '@playwright/test';
import { CalendarPage } from './pages/calendar.page';
import { LoginPage } from './pages/login.page';
import { InboxPage, InvoicesPage, ReportsPage } from './pages/money-inbox.page';
import { AdminShell } from './pages/shell.page';
import { SlotOffersPage } from './pages/slot-offers.page';
import { StudentsPage } from './pages/students.page';

export const test = base.extend<{
  loginPage: LoginPage;
  shell: AdminShell;
  calendar: CalendarPage;
  students: StudentsPage;
  invoices: InvoicesPage;
  inbox: InboxPage;
  reports: ReportsPage;
  slotOffers: SlotOffersPage;
}>({
  loginPage: async ({ page }, provide) => {
    await provide(new LoginPage(page));
  },
  shell: async ({ page }, provide) => {
    await provide(new AdminShell(page));
  },
  calendar: async ({ page }, provide) => {
    await provide(new CalendarPage(page));
  },
  students: async ({ page }, provide) => {
    await provide(new StudentsPage(page));
  },
  invoices: async ({ page }, provide) => {
    await provide(new InvoicesPage(page));
  },
  inbox: async ({ page }, provide) => {
    await provide(new InboxPage(page));
  },
  reports: async ({ page }, provide) => {
    await provide(new ReportsPage(page));
  },
  slotOffers: async ({ page }, provide) => {
    await provide(new SlotOffersPage(page));
  },
});

export { expect } from '@playwright/test';
