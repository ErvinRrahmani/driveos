export function isMinor(dateOfBirth: string, ageOfMajority: number, today: string): boolean {
  const [birthYear, birthDay] = [Number(dateOfBirth.slice(0, 4)), dateOfBirth.slice(5)];
  const [year, day] = [Number(today.slice(0, 4)), today.slice(5)];
  const age = year - birthYear - (day < birthDay ? 1 : 0);
  return age < ageOfMajority;
}

export function utcToday(now: Date): string {
  return now.toISOString().slice(0, 10);
}
