import { DatabaseSync } from 'node:sqlite';
import type { SqlDatabase, SqlRunner, SqlValue } from '../../src/lib/diary/store';

function runner(db: DatabaseSync): SqlRunner {
  return {
    execAsync: async (sql) => {
      db.exec(sql);
    },
    runAsync: async (sql, params: SqlValue[]) => {
      db.prepare(sql).run(...params);
    },
    getAllAsync: async <T>(sql: string, params: SqlValue[]) =>
      db.prepare(sql).all(...params) as T[],
  };
}

export function nodeSqliteDatabase(): SqlDatabase {
  const db = new DatabaseSync(':memory:');
  let queue: Promise<unknown> = Promise.resolve();
  return {
    ...runner(db),
    withExclusiveTransactionAsync(task) {
      const run = queue.then(async () => {
        db.exec('BEGIN IMMEDIATE');
        try {
          await task(runner(db));
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
}
