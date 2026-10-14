import { describe, expect, it } from 'vitest';
import { ageOn, exportFileBase, isMinorOn, nameMatches } from '../../src/lib/students';

describe('ageOn', () => {
  it('counts full years and turns over on the birthday', () => {
    expect(ageOn('2008-10-08', '2026-10-07')).toBe(17);
    expect(ageOn('2008-10-08', '2026-10-08')).toBe(18);
  });

  it('treats 29 February birthdays as 1 March in other years', () => {
    expect(ageOn('2008-02-29', '2026-02-28')).toBe(17);
    expect(ageOn('2008-02-29', '2026-03-01')).toBe(18);
  });
});

describe('isMinorOn', () => {
  it('uses the school age of majority', () => {
    expect(isMinorOn('2008-10-09', 18, '2026-10-08')).toBe(true);
    expect(isMinorOn('2008-10-08', 18, '2026-10-08')).toBe(false);
    expect(isMinorOn('2008-10-08', 19, '2026-10-08')).toBe(true);
  });

  it('defaults to 18 when the school has no setting', () => {
    expect(isMinorOn('2009-01-01', undefined, '2026-10-08')).toBe(true);
    expect(isMinorOn('2000-01-01', undefined, '2026-10-08')).toBe(false);
  });
});

describe('nameMatches', () => {
  it('ignores case and surrounding spaces', () => {
    expect(nameMatches('  stella STUDENT ', 'Stella Student')).toBe(true);
    expect(nameMatches('Stella', 'Stella Student')).toBe(false);
  });
});

describe('exportFileBase', () => {
  it('builds a file-safe slug from the student name', () => {
    expect(exportFileBase('Stella Student')).toBe('stella-student-export');
    expect(exportFileBase("  Jürgen O'Brien ")).toBe('jurgen-o-brien-export');
    expect(exportFileBase('***')).toBe('student-export');
  });
});
