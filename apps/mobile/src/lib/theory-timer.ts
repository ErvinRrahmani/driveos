export const TICK_MS = 1_000;

export function remainingMs(deadlineAt: string | null, now: number): number | null {
  if (deadlineAt === null) return null;
  return Math.max(0, Date.parse(deadlineAt) - now);
}

const pad = (value: number) => String(value).padStart(2, '0');

export function formatCountdown(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1_000);
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export interface CountdownOptions {
  deadlineAt: string;
  now?: () => number;
  onTick: (remaining: number) => void;
  onExpire: () => void;
}

export function startCountdown({
  deadlineAt,
  now = () => Date.now(),
  onTick,
  onExpire,
}: CountdownOptions): () => void {
  let expired = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const stop = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };
  const tick = () => {
    const remaining = remainingMs(deadlineAt, now()) ?? 0;
    onTick(remaining);
    if (remaining === 0 && !expired) {
      expired = true;
      stop();
      onExpire();
    }
  };
  tick();
  if (!expired) timer = setInterval(tick, TICK_MS);
  return stop;
}
