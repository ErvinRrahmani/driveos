import { randomUUID } from 'node:crypto';
import type pg from 'pg';

interface Column {
  name: string;
  udt: string;
  required: boolean;
  enumLabels?: string[];
  references?: { table: string; column: string };
}

export type Row = Record<string, unknown>;
export type RowSet = Map<string, Row>;

const OVERRIDES: Record<string, Row> = {
  ledger_entries: { entry_type: 'purchase', minutes: 60 },
  notifications: { address: 'student@example.com' },
  leads: { phone: '+4915550000020', is_minor: false },
};

function scalar(column: Column): unknown {
  if (column.enumLabels) return column.enumLabels[0];
  switch (column.udt) {
    case 'uuid':
      return randomUUID();
    case 'text':
    case 'varchar':
      return `${column.name}-${randomUUID()}`;
    case 'int2':
    case 'int4':
    case 'int8':
    case 'float8':
    case 'numeric':
      return 1;
    case 'bool':
      return true;
    case 'date':
      return '2026-03-01';
    case 'time':
      return '09:00';
    case 'timestamptz':
      return new Date('2026-03-01T09:00:00Z');
    case 'tstzrange':
      return '[2026-03-01 09:00:00+00,2026-03-01 10:00:00+00)';
    case 'jsonb':
      return {};
    case 'inet':
      return '127.0.0.1';
    case '_text':
      return ['owner'];
    case '_uuid':
      return [];
    default:
      throw new Error(`row-factory: no value for ${column.name} of type ${column.udt}`);
  }
}

export class RowFactory {
  private constructor(private readonly tables: Map<string, Column[]>) {}

  static async load(client: pg.Client): Promise<RowFactory> {
    const columns = await client.query<{
      table_name: string;
      column_name: string;
      udt_name: string;
      required: boolean;
      enum_labels: string[] | null;
      ref_table: string | null;
      ref_column: string | null;
    }>(
      `select c.table_name, c.column_name, c.udt_name,
              (c.is_nullable = 'NO' and c.column_default is null) as required,
              (select array_agg(e.enumlabel::text order by e.enumsortorder)
                 from pg_type t join pg_enum e on e.enumtypid = t.oid
                where t.typname = c.udt_name) as enum_labels,
              fk.ref_table, fk.ref_column
         from information_schema.columns c
         left join lateral (
           select ft.relname as ref_table, fa.attname as ref_column
             from pg_constraint k
             join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
             join pg_class ft on ft.oid = k.confrelid
             join pg_attribute fa on fa.attrelid = k.confrelid and fa.attnum = k.confkey[1]
            where k.contype = 'f' and k.conrelid = ('public.' || c.table_name)::regclass
              and a.attname = c.column_name and cardinality(k.conkey) = 1
            limit 1
         ) fk on true
        where c.table_schema = 'public'
        order by c.table_name, c.ordinal_position`,
    );
    const tables = new Map<string, Column[]>();
    for (const r of columns.rows) {
      const list = tables.get(r.table_name) ?? [];
      list.push({
        name: r.column_name,
        udt: r.udt_name,
        required: r.required,
        enumLabels: r.enum_labels ?? undefined,
        references:
          r.ref_table && r.ref_column ? { table: r.ref_table, column: r.ref_column } : undefined,
      });
      tables.set(r.table_name, list);
    }
    return new RowFactory(tables);
  }

  tableNames(): string[] {
    return [...this.tables.keys()].sort();
  }

  build(table: string, schoolId: string, existing: RowSet): Row {
    const columns = this.tables.get(table);
    if (!columns) throw new Error(`row-factory: unknown table ${table}`);
    const row: Row = {};
    for (const column of columns) {
      if (column.name === 'school_id' && (column.required || column.references)) {
        row.school_id = schoolId;
      } else if (table === 'schools' && column.name === 'id') {
        row.id = schoolId;
      } else if (!column.required) {
        continue;
      } else if (column.references) {
        const parent = existing.get(column.references.table);
        if (!parent) throw new Error(`row-factory: ${table} needs ${column.references.table}`);
        row[column.name] = parent[column.references.column];
      } else {
        row[column.name] = scalar(column);
      }
    }
    return { ...row, ...OVERRIDES[table] };
  }

  dependencies(table: string): string[] {
    return (this.tables.get(table) ?? [])
      .flatMap((c) =>
        c.references && (c.required || c.name === 'school_id') ? [c.references.table] : [],
      )
      .filter((t) => t !== table);
  }

  async ensure(
    client: pg.Client,
    table: string,
    schoolId: string,
    rows: RowSet,
    visiting: string[] = [],
  ): Promise<Row> {
    const done = rows.get(table);
    if (done) return done;
    if (visiting.includes(table)) {
      throw new Error(`row-factory: cycle ${[...visiting, table].join(' -> ')}`);
    }
    for (const dependency of this.dependencies(table)) {
      await this.ensure(client, dependency, schoolId, rows, [...visiting, table]);
    }
    const row = await insertReturning(client, table, this.build(table, schoolId, rows));
    rows.set(table, row);
    return row;
  }
}

export async function insertReturning(client: pg.Client, table: string, row: Row): Promise<Row> {
  const columns = Object.keys(row);
  const values = columns.map((c) => {
    const value = row[c];
    return value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Date)
      ? JSON.stringify(value)
      : value;
  });
  const { rows } = await client.query<Row>(
    `insert into ${client.escapeIdentifier(table)} (${columns.map((c) => client.escapeIdentifier(c)).join(', ')})
     values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
    values,
  );
  const [inserted] = rows;
  if (!inserted) throw new Error(`row-factory: insert into ${table} returned no row`);
  return inserted;
}

export function rowOf(rows: RowSet, table: string): Row {
  const row = rows.get(table);
  if (!row) throw new Error(`row-factory: no ${table} row`);
  return row;
}
