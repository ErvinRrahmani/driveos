export type ContactKind = 'phone' | 'email';

export interface Contact {
  kind: ContactKind;
  value: string;
}

const E164 = /^\+[1-9]\d{6,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_SEPARATORS = /[\s\-()./]/g;

export function normalizeContact(raw: string): Contact | null {
  const trimmed = raw.trim();
  if (trimmed.includes('@')) {
    const email = trimmed.toLowerCase();
    return email.length <= 254 && EMAIL.test(email) ? { kind: 'email', value: email } : null;
  }
  let phone = trimmed.replace(PHONE_SEPARATORS, '');
  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;
  return E164.test(phone) ? { kind: 'phone', value: phone } : null;
}

export function countryPrefix(phone: string): string {
  return phone.slice(0, 4);
}
