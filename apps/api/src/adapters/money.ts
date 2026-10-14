export function formatMinorAmount(minor: number, currency: string): string {
  const digits =
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  const sign = minor < 0 ? '-' : '';
  const absolute = Math.abs(minor);
  const scale = 10 ** digits;
  const whole = Math.floor(absolute / scale);
  const fraction = digits > 0 ? `.${String(absolute % scale).padStart(digits, '0')}` : '';
  return `${sign}${whole}${fraction} ${currency}`;
}
