const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const FONT_SIZE = 10;
const LEADING = 14;
const LINES_PER_PAGE = Math.floor((PAGE_HEIGHT - 2 * MARGIN) / LEADING);
const WIN_ANSI_EURO = 0x80;
const FIRST_PAGE_OBJECT = 4;

function toWinAnsi(text: string): string {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0x3f;
    if (char === '€') out += String.fromCharCode(WIN_ANSI_EURO);
    else out += code >= 0x20 && code <= 0xff ? char : '?';
  }
  return out;
}

function pdfString(text: string): string {
  return `(${toWinAnsi(text).replace(/[\\()]/g, (c) => `\\${c}`)})`;
}

function pagesOf(lines: readonly string[]): string[][] {
  const pages: string[][] = [];
  for (let start = 0; start < lines.length; start += LINES_PER_PAGE) {
    pages.push(lines.slice(start, start + LINES_PER_PAGE));
  }
  return pages.length > 0 ? pages : [[]];
}

function contentStream(lines: readonly string[]): string {
  const content = [
    'BT',
    `/F1 ${FONT_SIZE} Tf`,
    `${LEADING} TL`,
    `${MARGIN} ${PAGE_HEIGHT - MARGIN} Td`,
    ...lines.map((line) => `${pdfString(line)} Tj T*`),
    'ET',
  ].join('\n');
  return `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`;
}

export function renderTextPdf(lines: readonly string[]): Uint8Array {
  const pages = pagesOf(lines);
  const pageRef = (index: number) => `${FIRST_PAGE_OBJECT + 2 * index} 0 R`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, index) => pageRef(index)).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    ...pages.flatMap((page, index) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${FIRST_PAGE_OBJECT + 2 * index + 1} 0 R >>`,
      contentStream(page),
    ]),
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, 'latin1'));
}
