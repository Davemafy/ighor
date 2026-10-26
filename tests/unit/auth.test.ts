import { describe, it, expect } from "vitest";
import { AuthStore, AccountInput } from "../../src/data/auth-store";
import { createHash, randomUUID } from "node:crypto";

describe("Local account authentication", () => {
  it("preserves anonymous ownership at registration and restores it through a new login session", () => {
    const db = new AuthStore(":memory:");

    try {
      const anonymous = randomUUID();
      const owner = createHash("sha256").update(anonymous).digest("hex");
      const registered = db.register(
        {
          action: "register",
          username: "test_user",
          password: "synthetic-test-password-2026",
        },
        anonymous,
      );
      expect(db.owner(registered.token)).toBe(owner);
      expect(db.identity(registered.token)).toEqual({ username: "test_user" });
      expect(() => db.owner(anonymous)).toThrow();
      const login = db.login({
        action: "login",
        username: "TEST_USER",
        password: "synthetic-test-password-2026",
      });
      expect(db.owner(login.token)).toBe(owner);
      expect(login.token).not.toBe(registered.token);
      db.logout(login.token);
      expect(db.owner(login.token)).not.toBe(owner);
      expect(db.identity(login.token)).toBe(null);
    } finally {
      db.close();
    }
  });
  it("rejects bad credentials, blocks repeated guesses and expires sessions", () => {
    let now = Date.now();
    const db = new AuthStore(":memory:", () => now);

    try {
      const input = {
        action: "register",
        username: "person",
        password: "synthetic-test-password-2026",
      };
      const registered = db.register(input, randomUUID());

      for (let i = 0; i < 5; i++) {
        expect(() =>
          db.login({
            ...input,
            action: "login",
            password: "incorrect-synthetic-password",
          }),
        ).toThrow();
      }

      expect(() => db.login({ ...input, action: "login" })).toThrow("later");
      now += 16 * 60000;
      const login = db.login({ ...input, action: "login" });
      expect(db.identity(login.token)).toEqual({ username: "person" });
      now += 8 * 86400000;
      expect(db.identity(registered.token)).toBe(null);
      expect(db.identity(login.token)).toBe(null);
    } finally {
      db.close();
    }
  });
  it("does not permit duplicate account claims, short passwords, extra privileges or email-shaped usernames", () => {
    const db = new AuthStore(":memory:");

    try {
      const token = randomUUID();
      const input = {
        action: "register",
        username: "person",
        password: "synthetic-test-password-2026",
      };
      db.register(input, token);
      expect(() =>
        db.register({ ...input, username: "another" }, token),
      ).toThrow();

      for (const raw of [
        { ...input, password: "short" },
        { ...input, username: "x@example.com" },
        { ...input, role: "admin" },
      ]) {
        expect(AccountInput.safeParse(raw).success).toBe(false);
      }
    } finally {
      db.close();
    }
  });
});
