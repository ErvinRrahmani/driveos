declare module 'node:sqlite' {
  type SqlParam = string | number | null;
  interface StatementSync {
    run(...params: SqlParam[]): unknown;
    all(...params: SqlParam[]): unknown[];
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
