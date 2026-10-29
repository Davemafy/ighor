import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { QlooEnvelopeSchema, type CachedResponse } from "./qloo-response";
export interface ResponseCache {
  get(key: string): CachedResponse | null;
  set(key: string, value: CachedResponse): void;
}

export class MemoryResponseCache implements ResponseCache {
  rows = new Map<string, CachedResponse>();

  constructor(private ttl = 86400000) {}

  get(key: string) {
    const row = this.rows.get(key);

    return row && Date.now() - Date.parse(row.at) < this.ttl
      ? structuredClone(row)
      : null;
  }

  set(key: string, value: CachedResponse) {
    this.rows.set(key, structuredClone(value));
  }
}

export class SqliteResponseCache implements ResponseCache {
  private db: DatabaseSync;

  constructor(
    path: string,
    private ttl = 86400000,
  ) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      `PRAGMA journal_mode=WAL;
       CREATE TABLE IF NOT EXISTS qloo_cache (key TEXT PRIMARY KEY, body TEXT NOT NULL, at TEXT NOT NULL)`,
    );
  }

  get(key: string) {
    const row = this.db
      .prepare("SELECT body, at FROM qloo_cache WHERE key=?")
      .get(key);

    if (!row || Date.now() - Date.parse(String(row.at)) >= this.ttl) {
      return null;
    }

    try {
      return {
        body: QlooEnvelopeSchema.parse(JSON.parse(String(row.body))),
        at: String(row.at),
      };
    } catch {
      return null;
    }
  }

  close() {
    this.db.close();
  }

  set(key: string, value: CachedResponse) {
    this.db
      .prepare("INSERT OR REPLACE INTO qloo_cache VALUES(?,?,?)")
      .run(key, JSON.stringify(value.body), value.at);
  }
}
