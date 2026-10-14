import { useEffect, useRef, useState } from 'react';
import { remainingMs, startCountdown } from './theory-timer';

export function useCountdown(deadlineAt: string | null, onExpire: () => void): number | null {
  const [remaining, setRemaining] = useState(() => remainingMs(deadlineAt, Date.now()));
  const expire = useRef(onExpire);
  useEffect(() => {
    expire.current = onExpire;
  }, [onExpire]);
  useEffect(() => {
    if (deadlineAt === null) return undefined;
    return startCountdown({
      deadlineAt,
      onTick: setRemaining,
      onExpire: () => expire.current(),
    });
  }, [deadlineAt]);
  return remaining;
}
