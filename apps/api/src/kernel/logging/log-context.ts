import { AsyncLocalStorage } from 'node:async_hooks';

export type LogContext = Readonly<Record<string, string>>;

const storage = new AsyncLocalStorage<LogContext>();

export function withLogContext<T>(context: LogContext, fn: () => T): T {
  return storage.run({ ...storage.getStore(), ...context }, fn);
}

export function logContext(): LogContext {
  return storage.getStore() ?? {};
}
