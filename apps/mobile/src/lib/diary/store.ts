import type { LessonResponse } from '@driveos/shared';
import { type DiaryEntity, type DiaryEntityMap, entityIdOf, type QueuedOp } from './types';

export interface DiaryReader {
  get<E extends DiaryEntity>(entity: E, id: string): Promise<DiaryEntityMap[E] | null>;
  list<E extends DiaryEntity>(entity: E): Promise<DiaryEntityMap[E][]>;
  lessonsBetween(from: string, to: string): Promise<LessonResponse[]>;
  ops(): Promise<QueuedOp[]>;
  cursor(): Promise<string | null>;
}

export interface DiaryWriter extends DiaryReader {
  put<E extends DiaryEntity>(entity: E, value: DiaryEntityMap[E]): Promise<void>;
  remove(entity: DiaryEntity, id: string): Promise<void>;
  putOp(op: QueuedOp): Promise<void>;
  removeOp(opId: string): Promise<void>;
  setCursor(cursor: string): Promise<void>;
}

export interface DiaryStore {
  read(scope: string): DiaryReader;
  write<T>(scope: string, task: (tx: DiaryWriter) => Promise<T>): Promise<T>;
  wipe(): Promise<void>;
}

const ENTITIES: readonly DiaryEntity[] = [
  'lesson',
  'student',
  'vehicle',
  'progress_entry',
  'availability',
];

const iso = (value: string) => new Date(value).toISOString();

const overlaps = (lesson: LessonResponse, from: string, to: string) =>
  Date.parse(lesson.start) < Date.parse(to) && Date.parse(lesson.end) > Date.parse(from);

const byStart = (a: LessonResponse, b: LessonResponse) => Date.parse(a.start) - Date.parse(b.start);

const bySeq = (a: QueuedOp, b: QueuedOp) => a.seq - b.seq;

function serialized() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task);
    tail = run.catch(() => undefined);
    return run;
  };
}

interface MemoryScope {
  entities: Record<DiaryEntity, Map<string, string>>;
  ops: Map<string, string>;
  cursor: string | null;
}

const emptyScope = (): MemoryScope => ({
  entities: {
    lesson: new Map(),
    student: new Map(),
    vehicle: new Map(),
    progress_entry: new Map(),
    availability: new Map(),
  },
  ops: new Map(),
  cursor: null,
});

const cloneScope = (scope: MemoryScope): MemoryScope => ({
  entities: Object.fromEntries(
    ENTITIES.map((entity) => [entity, new Map(scope.entities[entity])]),
  ) as MemoryScope['entities'],
  ops: new Map(scope.ops),
  cursor: scope.cursor,
});

const parse = <T>(raw: string): T => JSON.parse(raw) as T;

class MemoryAccess implements DiaryWriter {
  constructor(private readonly data: () => MemoryScope) {}

  async get<E extends DiaryEntity>(entity: E, id: string) {
    const raw = this.data().entities[entity].get(id);
    return raw === undefined ? null : parse<DiaryEntityMap[E]>(raw);
  }

  async list<E extends DiaryEntity>(entity: E) {
    return [...this.data().entities[entity].values()].map((raw) => parse<DiaryEntityMap[E]>(raw));
  }

  async lessonsBetween(from: string, to: string) {
    const lessons = await this.list('lesson');
    return lessons.filter((lesson) => overlaps(lesson, from, to)).sort(byStart);
  }

  async ops() {
    return [...this.data().ops.values()].map((raw) => parse<QueuedOp>(raw)).sort(bySeq);
  }

  async cursor() {
    return this.data().cursor;
  }

  async put<E extends DiaryEntity>(entity: E, value: DiaryEntityMap[E]) {
    this.data().entities[entity].set(entityIdOf(entity, value), JSON.stringify(value));
  }

  async remove(entity: DiaryEntity, id: string) {
    this.data().entities[entity].delete(id);
  }

  async putOp(op: QueuedOp) {
    this.data().ops.set(op.op.opId, JSON.stringify(op));
  }

  async removeOp(opId: string) {
    this.data().ops.delete(opId);
  }

  async setCursor(cursor: string) {
    this.data().cursor = cursor;
  }
}

export class MemoryDiaryStore implements DiaryStore {
  private readonly scopes = new Map<string, MemoryScope>();
  private readonly queue = serialized();

  private scope(scope: string): MemoryScope {
    let data = this.scopes.get(scope);
    if (!data) {
      data = emptyScope();
      this.scopes.set(scope, data);
    }
    return data;
  }

  read(scope: string): DiaryReader {
    return new MemoryAccess(() => this.scopes.get(scope) ?? emptyScope());
  }

  write<T>(scope: string, task: (tx: DiaryWriter) => Promise<T>): Promise<T> {
    return this.queue(async () => {
      const working = cloneScope(this.scope(scope));
      const result = await task(new MemoryAccess(() => working));
      this.scopes.set(scope, working);
      return result;
    });
  }

  async wipe(): Promise<void> {
    await this.queue(async () => this.scopes.clear());
  }
}

export type SqlValue = string | number | null;

export interface SqlRunner {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: SqlValue[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]>;
}

export interface SqlDatabase extends SqlRunner {
  withExclusiveTransactionAsync(task: (txn: SqlRunner) => Promise<void>): Promise<void>;
}

const TABLES: Record<DiaryEntity, string> = {
  lesson: 'lessons',
  student: 'students',
  vehicle: 'vehicles',
  progress_entry: 'progress_entries',
  availability: 'availability',
};

const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS lessons (
  scope TEXT NOT NULL, id TEXT NOT NULL, start TEXT NOT NULL, "end" TEXT NOT NULL,
  data TEXT NOT NULL, PRIMARY KEY (scope, id));
CREATE INDEX IF NOT EXISTS lessons_scope_start ON lessons (scope, start);
${['students', 'vehicles', 'progress_entries', 'availability']
  .map(
    (table) =>
      `CREATE TABLE IF NOT EXISTS ${table} (scope TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (scope, id));`,
  )
  .join('\n')}
CREATE TABLE IF NOT EXISTS ops (
  scope TEXT NOT NULL, op_id TEXT NOT NULL, seq INTEGER NOT NULL, data TEXT NOT NULL,
  PRIMARY KEY (scope, op_id));
CREATE TABLE IF NOT EXISTS sync_state (scope TEXT PRIMARY KEY NOT NULL, cursor TEXT NOT NULL);
PRAGMA user_version = ${SCHEMA_VERSION};
`;

interface DataRow {
  data: string;
}

class SqlAccess implements DiaryWriter {
  constructor(
    private readonly sql: SqlRunner,
    private readonly scope: string,
  ) {}

  async get<E extends DiaryEntity>(entity: E, id: string) {
    const [row] = await this.sql.getAllAsync<DataRow>(
      `SELECT data FROM ${TABLES[entity]} WHERE scope = ? AND id = ?`,
      [this.scope, id],
    );
    return row ? parse<DiaryEntityMap[E]>(row.data) : null;
  }

  async list<E extends DiaryEntity>(entity: E) {
    const rows = await this.sql.getAllAsync<DataRow>(
      `SELECT data FROM ${TABLES[entity]} WHERE scope = ? ORDER BY id`,
      [this.scope],
    );
    return rows.map((row) => parse<DiaryEntityMap[E]>(row.data));
  }

  async lessonsBetween(from: string, to: string) {
    const rows = await this.sql.getAllAsync<DataRow>(
      'SELECT data FROM lessons WHERE scope = ? AND start < ? AND "end" > ? ORDER BY start, id',
      [this.scope, iso(to), iso(from)],
    );
    return rows.map((row) => parse<LessonResponse>(row.data));
  }

  async ops() {
    const rows = await this.sql.getAllAsync<DataRow>(
      'SELECT data FROM ops WHERE scope = ? ORDER BY seq',
      [this.scope],
    );
    return rows.map((row) => parse<QueuedOp>(row.data));
  }

  async cursor() {
    const [row] = await this.sql.getAllAsync<{ cursor: string }>(
      'SELECT cursor FROM sync_state WHERE scope = ?',
      [this.scope],
    );
    return row?.cursor ?? null;
  }

  async put<E extends DiaryEntity>(entity: E, value: DiaryEntityMap[E]) {
    const id = entityIdOf(entity, value);
    const data = JSON.stringify(value);
    if (entity === 'lesson') {
      const lesson = value as LessonResponse;
      await this.sql.runAsync(
        'INSERT OR REPLACE INTO lessons (scope, id, start, "end", data) VALUES (?, ?, ?, ?, ?)',
        [this.scope, id, iso(lesson.start), iso(lesson.end), data],
      );
      return;
    }
    await this.sql.runAsync(
      `INSERT OR REPLACE INTO ${TABLES[entity]} (scope, id, data) VALUES (?, ?, ?)`,
      [this.scope, id, data],
    );
  }

  async remove(entity: DiaryEntity, id: string) {
    await this.sql.runAsync(`DELETE FROM ${TABLES[entity]} WHERE scope = ? AND id = ?`, [
      this.scope,
      id,
    ]);
  }

  async putOp(op: QueuedOp) {
    await this.sql.runAsync(
      'INSERT OR REPLACE INTO ops (scope, op_id, seq, data) VALUES (?, ?, ?, ?)',
      [this.scope, op.op.opId, op.seq, JSON.stringify(op)],
    );
  }

  async removeOp(opId: string) {
    await this.sql.runAsync('DELETE FROM ops WHERE scope = ? AND op_id = ?', [this.scope, opId]);
  }

  async setCursor(cursor: string) {
    await this.sql.runAsync('INSERT OR REPLACE INTO sync_state (scope, cursor) VALUES (?, ?)', [
      this.scope,
      cursor,
    ]);
  }
}

class LazySqlRunner implements SqlRunner {
  constructor(private readonly db: () => Promise<SqlDatabase>) {}

  async execAsync(sql: string) {
    await (await this.db()).execAsync(sql);
  }

  async runAsync(sql: string, params: SqlValue[]) {
    return (await this.db()).runAsync(sql, params);
  }

  async getAllAsync<T>(sql: string, params: SqlValue[]) {
    return (await this.db()).getAllAsync<T>(sql, params);
  }
}

export class SqliteDiaryStore implements DiaryStore {
  private opened: Promise<SqlDatabase> | null = null;
  private readonly queue = serialized();

  constructor(private readonly open: () => Promise<SqlDatabase>) {}

  private db(): Promise<SqlDatabase> {
    this.opened ??= this.open().then(async (db) => {
      await db.execAsync(SCHEMA);
      return db;
    });
    return this.opened;
  }

  read(scope: string): DiaryReader {
    return new SqlAccess(new LazySqlRunner(() => this.db()), scope);
  }

  write<T>(scope: string, task: (tx: DiaryWriter) => Promise<T>): Promise<T> {
    return this.queue(async () => {
      const db = await this.db();
      let result: { value: T } | null = null;
      await db.withExclusiveTransactionAsync(async (txn) => {
        result = { value: await task(new SqlAccess(txn, scope)) };
      });
      if (!result) throw new Error('diary transaction finished without a result');
      return (result as { value: T }).value;
    });
  }

  async wipe(): Promise<void> {
    await this.queue(async () => {
      const db = await this.db();
      await db.withExclusiveTransactionAsync(async (txn) => {
        for (const table of [...Object.values(TABLES), 'ops', 'sync_state']) {
          await txn.runAsync(`DELETE FROM ${table}`, []);
        }
      });
    });
  }
}
