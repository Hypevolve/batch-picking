/**
 * Minimal in-memory stand-in for the parts of the Supabase query builder the
 * app uses (select/insert/update with eq/order/limit/single). Test-only; it
 * never opens a network connection.
 */
type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code?: string; message: string } | null };

const UNIQUE: Record<string, string[]> = { users: ["email"] };

export function fakeSupabase(tables: Record<string, Row[]>) {
  let nextId = 1000;

  function query(table: string) {
    tables[table] ??= [];
    const rows = tables[table];
    const state = {
      op: "select" as "select" | "insert" | "update",
      cols: "*",
      returning: null as string | null,
      values: null as Row | Row[] | null,
      filters: [] as Array<[string, unknown]>,
      order: null as [string, boolean] | null,
      limit: null as number | null,
      single: false,
    };

    const pick = (row: Row, cols: string): Row =>
      cols === "*"
        ? { ...row }
        : Object.fromEntries(cols.split(",").map((c) => c.trim()).map((c) => [c, row[c]]));

    function exec(): Result {
      const matches = (r: Row) => state.filters.every(([c, v]) => r[c] === v);

      if (state.op === "insert") {
        const list = Array.isArray(state.values) ? state.values : [state.values as Row];
        for (const v of list) {
          for (const col of UNIQUE[table] ?? []) {
            if (rows.some((r) => r[col] === v[col])) {
              return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint on ${col}` } };
            }
          }
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
        rows.filter(matches).forEach((r) => Object.assign(r, state.values));
        return { data: null, error: null };
      }

      let out = rows.filter(matches);
      if (state.order) {
        const [col, asc] = state.order;
        out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
      }
      if (state.limit !== null) out = out.slice(0, state.limit);
      const data = out.map((r) => pick(r, state.cols));
      return { data: state.single ? (data[0] ?? null) : data, error: null };
    }

    const builder = {
      select(cols = "*") {
        if (state.op === "select") state.cols = cols;
        else state.returning = cols;
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
      eq(col: string, val: unknown) {
        state.filters.push([col, val]);
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
