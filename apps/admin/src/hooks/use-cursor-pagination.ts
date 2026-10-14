import { useState } from 'react';

export interface CursorPagination {
  hasPrevious: boolean;
  next(nextCursor: string): void;
  previous(): void;
}

export function useCursorPagination(
  cursor: string | undefined,
  setCursor: (cursor: string | undefined) => void,
): CursorPagination {
  const [visited, setVisited] = useState<(string | undefined)[]>([]);
  return {
    hasPrevious: cursor !== undefined,
    next(nextCursor) {
      setVisited((stack) => [...stack, cursor]);
      setCursor(nextCursor);
    },
    previous() {
      setVisited((stack) => stack.slice(0, -1));
      setCursor(visited.at(-1));
    },
  };
}
