-- Turso/libSQL migration for the PostQueue app tables.
-- This migration is additive: it creates tables/indexes only if they are missing.
-- The existing users table is intentionally left untouched.

CREATE TABLE IF NOT EXISTS "posts" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "userId" INTEGER NOT NULL REFERENCES "users"("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  "content" TEXT NOT NULL,
  "category" TEXT(32) DEFAULT 'manual' NOT NULL,
  "source" TEXT DEFAULT 'manual' NOT NULL,
  "status" TEXT DEFAULT 'pending' NOT NULL,
  "slotKey" TEXT(40),
  "xPostId" TEXT(32),
  "errorMessage" TEXT,
  "createdAt" INTEGER DEFAULT (unixepoch() * 1000) NOT NULL,
  "approvedAt" INTEGER,
  "publishedAt" INTEGER,
  "updatedAt" INTEGER DEFAULT (unixepoch() * 1000) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "posts_slotKey_unique" ON "posts" ("slotKey");
CREATE UNIQUE INDEX IF NOT EXISTS "posts_xPostId_unique" ON "posts" ("xPostId");
CREATE INDEX IF NOT EXISTS "posts_userId_idx" ON "posts" ("userId");

CREATE TABLE IF NOT EXISTS "postSettings" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "userId" INTEGER NOT NULL UNIQUE REFERENCES "users"("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  "topics" TEXT NOT NULL,
  "tone" TEXT NOT NULL,
  "paused" INTEGER DEFAULT 0 NOT NULL,
  "generationTaskUid" TEXT(80),
  "createdAt" INTEGER DEFAULT (unixepoch() * 1000) NOT NULL,
  "updatedAt" INTEGER DEFAULT (unixepoch() * 1000) NOT NULL
);
