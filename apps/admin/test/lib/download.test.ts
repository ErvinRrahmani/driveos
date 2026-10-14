import { afterEach, describe, expect, it, vi } from 'vitest';
import { base64ToBlob, saveBlob } from '../../src/lib/download';

const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };

afterEach(() => {
  vi.restoreAllMocks();
  URL.createObjectURL = original.create;
  URL.revokeObjectURL = original.revoke;
});

describe('saveBlob', () => {
  it('clicks a link to an object URL with the file name and revokes it', () => {
    const create = vi.fn(() => 'blob:invoice');
    const revoke = vi.fn();
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    const clicked: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ href: this.href, download: this.download });
    });
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    saveBlob(blob, '2026-000042.pdf');
    expect(create).toHaveBeenCalledWith(blob);
    expect(clicked).toEqual([{ href: 'blob:invoice', download: '2026-000042.pdf' }]);
    expect(revoke).toHaveBeenCalledWith('blob:invoice');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});

describe('base64ToBlob', () => {
  it('decodes base64 into a typed binary blob', async () => {
    const blob = base64ToBlob(btoa('%PDF-1.4\u00ff'), 'application/pdf');
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBe(9);
    expect(new Uint8Array(await blob.arrayBuffer()).at(-1)).toBe(255);
  });
});
