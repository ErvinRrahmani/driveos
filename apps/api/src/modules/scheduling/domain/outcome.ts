export function hasStarted(lessonStart: Date, now: Date): boolean {
  return lessonStart.getTime() <= now.getTime();
}
