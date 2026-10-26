import { DatabaseSync } from "node:sqlite";
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";

export const AccountInput = z.strictObject({
  action: z.enum(["register", "login"]),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9_-]{2,31}$/),
  password: z.string().min(12).max(128),
});

const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export class AuthStore {
  private db: DatabaseSync;

  constructor(
    path: string,
    private now = () => Date.now(),
  ) {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }

    this.db = new DatabaseSync(path);
    this.db.exec(
      `PRAGMA busy_timeout=5000;
       PRAGMA journal_mode=WAL;

       CREATE TABLE IF NOT EXISTS accounts (
         username TEXT PRIMARY KEY,
         owner TEXT NOT NULL UNIQUE,
         salt TEXT NOT NULL,
         password TEXT NOT NULL
       );

       CREATE TABLE IF NOT EXISTS sessions (
         hash TEXT PRIMARY KEY,
         owner TEXT NOT NULL,
         expires INTEGER NOT NULL
       );

       CREATE TABLE IF NOT EXISTS auth_attempts (
         bucket TEXT PRIMARY KEY,
         attempts INTEGER NOT NULL,
         reset INTEGER NOT NULL
       );`,
    );
  }

  owner(token: string) {
    const hash = digest(token);
    const session = this.db
      .prepare("SELECT owner,expires FROM sessions WHERE hash=?")
      .get(hash);

    if (session && Number(session.expires) > this.now()) {
      return String(session.owner);
    }

    if (this.db.prepare("SELECT owner FROM accounts WHERE owner=?").get(hash)) {
      throw new Error("Session required.");
    }

    return hash;
  }

  identity(token: string) {
    const owner = this.owner(token);
    const row = this.db
      .prepare("SELECT username FROM accounts WHERE owner=?")
      .get(owner);

    return row ? { username: String(row.username) } : null;
  }

  private issue(owner: string) {
    const token = randomUUID();
    this.db.prepare("DELETE FROM sessions WHERE expires<=?").run(this.now());
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(digest(token), owner, this.now() + 7 * 86400000);

    return token;
  }

  private throttle() {
    this.db.exec("BEGIN IMMEDIATE");

    try {
      this.db
        .prepare("DELETE FROM auth_attempts WHERE reset<=?")
        .run(this.now());
      const current = this.db
        .prepare(
          "SELECT attempts,reset FROM auth_attempts WHERE bucket='global'",
        )
        .get();

      if (current && Number(current.attempts) >= 30) {
        throw new Error("Try later.");
      }

      this.db
        .prepare("INSERT OR REPLACE INTO auth_attempts VALUES('global',?,?)")
        .run(
          Number(current?.attempts ?? 0) + 1,
          Number(current?.reset ?? this.now() + 60000),
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  register(raw: unknown, anonymousToken: string) {
    const input = AccountInput.parse(raw);

    if (input.action !== "register") {
      throw new Error("Invalid action.");
    }

    this.throttle();

    if (
      Number(
        this.db.prepare("SELECT COUNT(*) AS count FROM accounts").get()?.count,
      ) >= 1000
    ) {
      throw new Error("Account limit reached.");
    }

    const owner = this.owner(anonymousToken);
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(input.password, salt, 32).toString("hex");
    this.db
      .prepare("INSERT INTO accounts VALUES(?,?,?,?)")
      .run(input.username, owner, salt, hash);

    return { token: this.issue(owner), username: input.username };
  }

  login(raw: unknown) {
    const input = AccountInput.parse(raw);

    if (input.action !== "login") {
      throw new Error("Invalid action.");
    }

    this.throttle();
    const bucket = digest(input.username);
    const attempt = this.db
      .prepare("SELECT attempts,reset FROM auth_attempts WHERE bucket=?")
      .get(bucket);

    if (
      attempt &&
      Number(attempt.reset) > this.now() &&
      Number(attempt.attempts) >= 5
    ) {
      throw new Error("Try later.");
    }

    const row = this.db
      .prepare("SELECT * FROM accounts WHERE username=?")
      .get(input.username);
    const actual = scryptSync(
      input.password,
      row ? String(row.salt) : "unknown-account-dummy-salt",
      32,
    );
    const expected = row
      ? Buffer.from(String(row.password), "hex")
      : Buffer.alloc(32);

    if (!timingSafeEqual(actual, expected) || !row) {
      const count =
        attempt && Number(attempt.reset) > this.now()
          ? Number(attempt.attempts) + 1
          : 1;
      this.db
        .prepare("INSERT OR REPLACE INTO auth_attempts VALUES(?,?,?)")
        .run(bucket, count, this.now() + 15 * 60000);
      throw new Error("Sign in failed.");
    }

    this.db.prepare("DELETE FROM auth_attempts WHERE bucket=?").run(bucket);

    return {
      token: this.issue(String(row.owner)),
      username: String(row.username),
    };
  }

  logout(token: string) {
    this.db.prepare("DELETE FROM sessions WHERE hash=?").run(digest(token));
  }

  close() {
    this.db.close();
  }
}

let singleton: AuthStore | undefined;

export function getAuth() {
  return (singleton ??= new AuthStore(
    process.env.IGOR_AUTH_PATH ?? `${process.cwd()}/.igor/auth.sqlite`,
  ));
}
