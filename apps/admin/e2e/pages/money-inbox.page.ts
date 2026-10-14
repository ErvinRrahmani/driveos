import type { Locator, Page } from '@playwright/test';

export class InvoicesPage {
  readonly table: Locator;

  constructor(page: Page) {
    this.table = page.getByRole('table', { name: 'Invoices' });
  }

  row(number: string): Locator {
    return this.table.getByRole('row').filter({ hasText: number });
  }
}

export class InboxPage {
  readonly conversations: Locator;
  readonly thread: Locator;
  readonly composer: Locator;
  readonly send: Locator;
  readonly readOnlyNotice: Locator;

  constructor(page: Page) {
    this.conversations = page.getByRole('list', { name: 'Conversations' });
    this.thread = page.getByRole('log', { name: 'Messages' });
    this.composer = page.getByRole('textbox', { name: 'Message' });
    this.send = page.getByRole('button', { name: 'Send' });
    this.readOnlyNotice = page.getByText(/The school can read it but cannot reply/);
  }

  conversation(kindLabel: string): Locator {
    return this.conversations.getByRole('link').filter({ hasText: kindLabel });
  }
}

export class ReportsPage {
  constructor(private readonly page: Page) {}

  tab(name: string): Locator {
    return this.page.getByRole('tab', { name, exact: true });
  }

  table(name: string): Locator {
    return this.page.getByRole('table', { name });
  }

  chart(name: string): Locator {
    return this.page.getByRole('img', { name });
  }
}
