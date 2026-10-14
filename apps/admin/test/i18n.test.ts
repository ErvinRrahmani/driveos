import { describe, expect, it } from 'vitest';
import { i18n } from '../src/i18n';

describe('admin i18n', () => {
  it('resolves the example key in English', () => {
    expect(i18n.t('app.title')).toBe('DriveOS Admin');
  });
});
