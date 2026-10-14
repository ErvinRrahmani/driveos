import { useCallback, useState } from 'react';

export type DialogTarget<T> = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; item: T };

export function useDialogTarget<T>() {
  const [target, setTarget] = useState<DialogTarget<T>>({ mode: 'closed' });
  const create = useCallback(() => setTarget({ mode: 'create' }), []);
  const edit = useCallback((item: T) => setTarget({ mode: 'edit', item }), []);
  const close = useCallback(() => setTarget({ mode: 'closed' }), []);
  return { target, open: target.mode !== 'closed', create, edit, close };
}
