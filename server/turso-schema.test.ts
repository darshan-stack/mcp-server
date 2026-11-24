import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { ensureTursoAppSchema } from "./turso-schema";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Turso app schema bootstrap", () => {
  it("creates missing queue tables, is idempotent, and preserves multi-post history", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "postqueue-turso-"));
    temporaryDirectories.push(directory);
    const client = createClient({ url: `file:${path.join(directory, "test.db")}` });

    try {
      await client.execute(`CREATE TABLE "users" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "openId" TEXT NOT NULL UNIQUE
      )`);

      await ensureTursoAppSchema(client);
      await ensureTursoAppSchema(client);

      const userResult = await client.execute({
        sql: `INSERT INTO "users" ("openId") VALUES (?)`,
        args: ["schema-test-user"],
      });
      const userId = Number(userResult.lastInsertRowid);

      await client.execute({
        sql: `INSERT INTO "postSettings" ("userId", "topics", "tone") VALUES (?, ?, ?)`,
        args: [userId, "test topics", "test tone"],
      });
      await client.execute({
        sql: `INSERT INTO "posts" ("userId", "content", "slotKey") VALUES (?, ?, ?)`,
        args: [userId, "first draft", "slot-1"],
      });
      await client.execute({
        sql: `INSERT INTO "posts" ("userId", "content", "slotKey") VALUES (?, ?, ?)`,
        args: [userId, "second draft", "slot-2"],
      });

      const settings = await client.execute({
        sql: `SELECT "topics", "createdAt" FROM "postSettings" WHERE "userId" = ?`,
        args: [userId],
      });
      const posts = await client.execute({
        sql: `SELECT COUNT(*) AS "count" FROM "posts" WHERE "userId" = ?`,
        args: [userId],
      });

      expect(settings.rows[0]?.topics).toBe("test topics");
      expect(Number(settings.rows[0]?.createdAt)).toBeGreaterThan(1_700_000_000_000);
      expect(Number(posts.rows[0]?.count)).toBe(2);
    } finally {
      client.close();
    }
  });
});
