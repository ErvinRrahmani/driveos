import type { Locator, Page } from '@playwright/test';

export class LoginPage {
  readonly heading: Locator;
  readonly contact: Locator;
  readonly sendCode: Locator;
  readonly code: Locator;
  readonly signIn: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Sign in to DriveOS' });
    this.contact = page.getByLabel('Phone or email');
    this.sendCode = page.getByRole('button', { name: 'Send code' });
    this.code = page.getByLabel('Code');
    this.signIn = page.getByRole('button', { name: 'Sign in' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  async signInWith(contact: string, code: string): Promise<void> {
    await this.contact.fill(contact);
    await this.sendCode.click();
    await this.code.fill(code);
    await this.signIn.click();
  }
}
