export interface SyllabusEntry {
  id: string;
  code: string;
  title: string;
  sortOrder: number;
}

export interface ProgressMark {
  syllabusItemId: string;
  lessonId: string;
  level: number;
  note: string;
  at: Date;
  updatedAt: Date;
}

export interface SyllabusItemProgress {
  syllabusItemId: string;
  code: string;
  title: string;
  sortOrder: number;
  level: number | null;
  lastNote: string | null;
  lessonCount: number;
  updatedAt: Date | null;
}

export interface ProgressSummary {
  items: SyllabusItemProgress[];
  progressPct: number;
}

const chronological = (a: ProgressMark, b: ProgressMark) =>
  a.at.getTime() - b.at.getTime() || a.updatedAt.getTime() - b.updatedAt.getTime();

function summarizeItem(item: SyllabusEntry, marks: ProgressMark[]): SyllabusItemProgress {
  const ordered = [...marks].sort(chronological);
  const latest = ordered.at(-1);
  const noted = ordered.filter((mark) => mark.note !== '').at(-1);
  const updated = marks.reduce<Date | null>(
    (max, mark) => (max === null || mark.updatedAt > max ? mark.updatedAt : max),
    null,
  );
  return {
    syllabusItemId: item.id,
    code: item.code,
    title: item.title,
    sortOrder: item.sortOrder,
    level: latest?.level ?? null,
    lastNote: noted?.note ?? null,
    lessonCount: new Set(marks.map((mark) => mark.lessonId)).size,
    updatedAt: updated,
  };
}

export function summarizeProgress(
  syllabus: readonly SyllabusEntry[],
  marks: readonly ProgressMark[],
  maxLevel: number,
): ProgressSummary {
  const ordered = [...syllabus].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
  );
  const items = ordered.map((item) =>
    summarizeItem(
      item,
      marks.filter((mark) => mark.syllabusItemId === item.id),
    ),
  );
  if (items.length === 0) return { items, progressPct: 0 };
  const total = items.reduce((sum, item) => sum + (item.level ?? 0), 0);
  return { items, progressPct: Math.round((100 * total) / (items.length * maxLevel)) };
}
