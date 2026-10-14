const DEFAULT_LOCALE = 'en';

export function minorUnitDigits(currency: string): number {
  return (
    new Intl.NumberFormat(DEFAULT_LOCALE, { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

export function formatMoney(
  amountMinor: number,
  currency: string,
  locale = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    fromMinor(amountMinor, currency),
  );
}

export function toMinor(major: number, currency: string): number {
  return Math.round(major * 10 ** minorUnitDigits(currency));
}

export function fromMinor(amountMinor: number, currency: string): number {
  return amountMinor / 10 ** minorUnitDigits(currency);
}

export function percentToBasisPoints(percent: number): number {
  return Math.round(percent * 100);
}

export function basisPointsToPercent(basisPoints: number): number {
  return basisPoints / 100;
}
