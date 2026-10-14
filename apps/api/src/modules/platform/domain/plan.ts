const CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

export function isPlanCurrency(code: string): boolean {
  return CURRENCIES.has(code);
}
