export interface Period {
  start: Date;
  end: Date;
}

const RANGE = /^\["?([^",]+)"?,"?([^",]+)"?\)$/;
const TIMESTAMP =
  /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}(?::?\d{2})?)?$/;

function parseBound(text: string, raw: string): Date {
  const match = TIMESTAMP.exec(text);
  if (!match) throw new Error(`Unsupported tstzrange bound in ${raw}`);
  const [, day, time, zone] = match;
  const offset = !zone || zone === 'Z' ? 'Z' : zone.length === 3 ? `${zone}:00` : zone;
  const date = new Date(`${day}T${time}${offset}`);
  if (Number.isNaN(date.getTime())) throw new Error(`Unsupported tstzrange bound in ${raw}`);
  return date;
}

export function parseRange(raw: string): Period {
  const match = RANGE.exec(raw.trim());
  if (!match?.[1] || !match[2]) throw new Error(`Unsupported tstzrange value ${raw}`);
  return { start: parseBound(match[1], raw), end: parseBound(match[2], raw) };
}

export function formatRange(period: Period): string {
  return `[${period.start.toISOString()},${period.end.toISOString()})`;
}

export function overlaps(a: Period, b: Period): boolean {
  return a.start < b.end && b.start < a.end;
}

export function subtractPeriods(period: Period, cuts: readonly Period[]): Period[] {
  let pieces: Period[] = [period];
  for (const cut of cuts) {
    pieces = pieces.flatMap((piece) => {
      if (!overlaps(piece, cut)) return [piece];
      const rest: Period[] = [];
      if (piece.start < cut.start) rest.push({ start: piece.start, end: cut.start });
      if (cut.end < piece.end) rest.push({ start: cut.end, end: piece.end });
      return rest;
    });
  }
  return pieces.sort((a, b) => a.start.getTime() - b.start.getTime());
}
