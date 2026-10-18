/**
 * Minimal in-memory stand-in for the parts of the Supabase query builder the
 * app uses (select with count/head and one level of embedded relations,
 * insert/update/delete, eq/neq/in/order/limit/range/single). Test-only; it
 * never opens a network connection.
 */
type Row = Record<string, unknown>;
type Result = {
  data: unknown;
  error: { code?: string; message: string } | null;
  count?: number | null;
};

const UNIQUE: Record<string, string[]> = { users: ["email"] };
/** table.column -> referenced table.column, checked on insert and update. */
const FOREIGN: Record<string, Array<[string, string, string]>> = {
  product_locations: [["sku", "products", "sku"]],
};

/** Splits a select list on top-level commas: "id, orders(a, b)" -> ["id", "orders(a, b)"]. */
function splitColumns(cols: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of cols) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

export function fakeSupabase(tables: Record<string, Row[]>) {
  let nextId = 1000;

  function query(table: string) {
    tables[table] ??= [];
    const rows = tables[table];
    const state = {
      op: "select" as "select" | "insert" | "update" | "delete",
      cols: "*",
      count: false,
      head: false,
      returning: null as string | null,
      values: null as Row | Row[] | null,
      filters: [] as Array<(r: Row) => boolean>,
      order: null as [string, boolean] | null,
      limit: null as number | null,
      range: null as [number, number] | null,
      single: false,
    };

    const pick = (row: Row, cols: string): Row => {
      if (cols === "*") return { ...row };
      return Object.fromEntries(
        splitColumns(cols).map((c) => {
          const embed = c.match(/^(\w+)\((.*)\)$/);
          if (!embed) return [c, row[c]];
          // Many-to-one embed: orders(...) follows order_id, users(...) follows user_id.
          const [, rel, relCols] = embed;
          const fk = `${rel.replace(/s$/, "")}_id`;
          const target = (tables[rel] ?? []).find((r) => r.id === row[fk]);
          return [rel, target ? pick(target, relCols) : null];
        })
      );
    };

    function foreignKeyError(v: Row): Result | null {
      for (const [col, refTable, refCol] of FOREIGN[table] ?? []) {
        if (col in v && !(tables[refTable] ?? []).some((r) => r[refCol] === v[col])) {
          return {
            data: null,
            error: { code: "23503", message: `insert or update on table "${table}" violates foreign key constraint on ${col}` },
          };
        }
      }
      return null;
    }

    function exec(): Result {
      const matches = (r: Row) => state.filters.every((f) => f(r));

      if (state.op === "insert") {
        const list = Array.isArray(state.values) ? state.values : [state.values as Row];
        for (const v of list) {
          for (const col of UNIQUE[table] ?? []) {
            if (rows.some((r) => r[col] === v[col])) {
              return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint on ${col}` } };
            }
          }
          const fkError = foreignKeyError(v);
          if (fkError) return fkError;
        }
        const inserted = list.map((v) => {
          const row = { id: nextId++, created_at: new Date().toISOString(), ...v };
          rows.push(row);
          return row;
        });
        const data = state.returning ? inserted.map((r) => pick(r, state.returning!)) : null;
        return { data: state.single ? (data?.[0] ?? null) : data, error: null };
      }

      if (state.op === "update") {
        const fkError = foreignKeyError(state.values as Row);
        if (fkError) return fkError;
        rows.filter(matches).forEach((r) => Object.assign(r, state.values));
        return { data: null, error: null };
      }

      if (state.op === "delete") {
        for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i])) rows.splice(i, 1);
        return { data: null, error: null };
      }

      let out = rows.filter(matches);
      const total = out.length;
      if (state.order) {
        const [col, asc] = state.order;
        out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
      }
      if (state.range) {
        const [from, to] = state.range;
        if (from > 0 && from >= total) {
          return { data: null, count: null, error: { code: "PGRST103", message: "Requested range not satisfiable" } };
        }
        out = out.slice(from, to + 1);
      }
      if (state.limit !== null) out = out.slice(0, state.limit);
      const count = state.count ? total : null;
      if (state.head) return { data: null, count, error: null };
      const data = out.map((r) => pick(r, state.cols));
      return { data: state.single ? (data[0] ?? null) : data, count, error: null };
    }

    const builder = {
      select(cols = "*", opts: { count?: "exact"; head?: boolean } = {}) {
        if (state.op === "select") {
          state.cols = cols;
          state.count = opts.count === "exact";
          state.head = opts.head === true;
        } else {
          state.returning = cols;
        }
        return builder;
      },
      insert(values: Row | Row[]) {
        state.op = "insert";
        state.values = values;
        return builder;
      },
      update(values: Row) {
        state.op = "update";
        state.values = values;
        return builder;
      },
      delete() {
        state.op = "delete";
        return builder;
      },
      eq(col: string, val: unknown) {
        state.filters.push((r) => r[col] === val);
        return builder;
      },
      neq(col: string, val: unknown) {
        state.filters.push((r) => r[col] !== val);
        return builder;
      },
      in(col: string, vals: unknown[]) {
        state.filters.push((r) => vals.includes(r[col]));
        return builder;
      },
      order(col: string, opts: { ascending?: boolean } = {}) {
        state.order = [col, opts.ascending ?? true];
        return builder;
      },
      limit(n: number) {
        state.limit = n;
        return builder;
      },
      range(from: number, to: number) {
        state.range = [from, to];
        return builder;
      },
      single() {
        state.single = true;
        return builder;
      },
      maybeSingle() {
        state.single = true;
        return builder;
      },
      then<T>(resolve: (r: Result) => T, reject?: (e: unknown) => T) {
        try {
          return Promise.resolve(resolve(exec()));
        } catch (e) {
          return reject ? Promise.resolve(reject(e)) : Promise.reject(e);
        }
      },
    };
    return builder;
  }

  return { from: (table: string) => query(table) };
}
