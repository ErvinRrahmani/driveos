export const colors = {
  background: '#F7F8FA',
  surface: '#FFFFFF',
  border: '#E2E5EA',
  text: '#111827',
  muted: '#6B7280',
  primary: '#1D4ED8',
  primaryPressed: '#1E40AF',
  onPrimary: '#FFFFFF',
  danger: '#B91C1C',
  dangerSurface: '#FEF2F2',
  warning: '#92400E',
  warningSurface: '#FFFBEB',
  success: '#166534',
  successSurface: '#F0FDF4',
  info: '#1E3A8A',
  infoSurface: '#EFF6FF',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 6, md: 10, lg: 14 } as const;

export const typography = {
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} as const;

export const theme = { colors, spacing, radius, typography } as const;
