// Minimal D1 stand-in on top of node:sqlite, so API tests run without a Workers runtime.
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

class Stmt {
  private args: unknown[] = [];
  constructor(private db: DatabaseSync, readonly sql: string) {}
  bind(...a: unknown[]) {
    this.args = a.map((v) => (v === undefined ? null : v));
    return this;
  }
  async first<T = unknown>(): Promise<T | null> {
    return (this.db.prepare(this.sql).get(...(this.args as any[])) as T) ?? null;
  }
  async all<T = unknown>() {
    return { results: this.db.prepare(this.sql).all(...(this.args as any[])) as T[], success: true };
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...(this.args as any[]));
    return { success: true, meta: { changes: Number(r.changes) } };
  }
}

export function makeD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(f, dir), "utf8"));
  return {
    prepare: (sql: string) => new Stmt(db, sql),
    batch: async (stmts: Stmt[]) => {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    exec: async (sql: string) => {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
  } as unknown as D1Database;
}
