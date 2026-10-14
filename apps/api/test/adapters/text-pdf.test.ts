import { describe, expect, it } from 'vitest';
import { renderTextPdf } from '../../src/adapters/pdf/text-pdf.js';

const objectOffsetsMatch = (pdf: string) => {
  const startXref = Number(/startxref\s+(\d+)/.exec(pdf)?.[1]);
  expect(pdf.slice(startXref, startXref + 4)).toBe('xref');
  const offsets = [...pdf.matchAll(/^(\d{10}) 00000 n/gm)].map((m) => Number(m[1]));
  expect(offsets.length).toBeGreaterThan(3);
  offsets.forEach((offset, index) => {
    expect(pdf.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`);
  });
};

describe('renderTextPdf', () => {
  it('writes a valid cross-reference table', () => {
    const pdf = Buffer.from(renderTextPdf(['Hello (world) \\ back', 'Grüße'])).toString('latin1');
    objectOffsetsMatch(pdf);
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('(Hello \\(world\\) \\\\ back)');
    expect(pdf).toContain('Grüße');
    expect(pdf).toContain('/Count 1');
  });

  it('flows long documents onto further pages instead of dropping lines', () => {
    const lines = Array.from({ length: 130 }, (_, index) => `Line ${index + 1}`);
    const pdf = Buffer.from(renderTextPdf(lines)).toString('latin1');
    objectOffsetsMatch(pdf);
    expect(pdf).toContain('/Count 3');
    expect(pdf).toContain('(Line 1)');
    expect(pdf).toContain('(Line 130)');
  });
});
