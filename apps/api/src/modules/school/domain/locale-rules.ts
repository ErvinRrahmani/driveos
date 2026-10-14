const TIME_ZONES = new Set(Intl.supportedValuesOf('timeZone'));
const CURRENCIES = new Set(Intl.supportedValuesOf('currency'));
const ZONE_NAME = /^[A-Z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;

function resolvesAsTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function isIanaTimeZone(zone: string): boolean {
  if (TIME_ZONES.has(zone)) return true;
  return ZONE_NAME.test(zone) && resolvesAsTimeZone(zone);
}

export function isIsoCurrency(code: string): boolean {
  return CURRENCIES.has(code);
}

export interface LocaleFields {
  timeZone?: string;
  currency?: string;
}

export function localeRuleIssues(fields: LocaleFields): { path: string[]; message: string }[] {
  const issues: { path: string[]; message: string }[] = [];
  if (fields.timeZone !== undefined && !isIanaTimeZone(fields.timeZone)) {
    issues.push({ path: ['timeZone'], message: 'Expected an IANA time zone' });
  }
  if (fields.currency !== undefined && !isIsoCurrency(fields.currency)) {
    issues.push({ path: ['currency'], message: 'Expected an ISO 4217 currency code' });
  }
  return issues;
}
