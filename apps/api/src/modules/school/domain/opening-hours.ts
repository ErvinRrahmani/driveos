export interface OpeningHoursRange {
  branchId: string | null;
  weekday: number;
  opens: string;
  closes: string;
}

function seconds(time: string): number {
  const [hours = 0, minutes = 0, secs = 0] = time.split(':').map(Number);
  return hours * 3600 + minutes * 60 + secs;
}

export function openingHoursOverlaps(ranges: readonly OpeningHoursRange[]): number[] {
  const overlapping: number[] = [];
  ranges.forEach((range, index) => {
    const clash = ranges
      .slice(0, index)
      .some(
        (earlier) =>
          earlier.branchId === range.branchId &&
          earlier.weekday === range.weekday &&
          seconds(earlier.opens) < seconds(range.closes) &&
          seconds(range.opens) < seconds(earlier.closes),
      );
    if (clash) overlapping.push(index);
  });
  return overlapping;
}
