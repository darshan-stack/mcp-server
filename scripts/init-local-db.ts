import { createClient } from "@libsql/client";

// SQLite migration - creates tables if they don't exist
const client = createClient({
  url: "file:./local.db",
});

const migrations = [
  // Users table
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    openId TEXT(64) NOT NULL UNIQUE,
    name TEXT,
    email TEXT(320),
    loginMethod TEXT(64),
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updatedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    lastSignedIn INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
  )`,

  // Posts table
  `CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    category TEXT(32) NOT NULL DEFAULT 'manual',
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('ai', 'manual')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'publishing', 'published', 'rejected', 'failed', 'unknown')),
    slotKey TEXT(40) UNIQUE,
    xPostId TEXT(32) UNIQUE,
    errorMessage TEXT,
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    approvedAt INTEGER,
    publishedAt INTEGER,
    updatedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
  )`,

  // Post settings table
  `CREATE TABLE IF NOT EXISTS postSettings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    topics TEXT NOT NULL,
    tone TEXT NOT NULL,
    paused INTEGER NOT NULL DEFAULT 0,
    generationTaskUid TEXT(80),
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updatedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
  )`,

  // Index for posts by userId
  `CREATE INDEX IF NOT EXISTS posts_userId_idx ON posts(userId)`,
];

async function runMigrations() {
  console.log("Running local SQLite migrations...");
  
  for (const sql of migrations) {
    try {
      await client.execute(sql);
      console.log("✓ Executed migration");
    } catch (error) {
      console.error("Migration failed:", error);
      throw error;
    }
  }
  
  // Insert default local owner user
  try {
    await client.execute(`
      INSERT OR IGNORE INTO users (id, openId, name, role, loginMethod, createdAt, updatedAt, lastSignedIn)
      VALUES (1, 'local_owner', 'Owner', 'admin', 'local', strftime('%s', 'now'), strftime('%s', 'now'), strftime('%s', 'now'))
    `);
    console.log("✓ Local owner user created");
  } catch (error) {
    console.error("Failed to create local user:", error);
  }

  // Insert default settings for local owner
  try {
    await client.execute(`
      INSERT OR IGNORE INTO postSettings (userId, topics, tone, paused)
      VALUES (1, 'software development, open source, learning in public, practical developer lessons, and developer life', 'first-person developer journal: candid, conversational, concise, lightly humorous', 0)
    `);
    console.log("✓ Default settings created");
  } catch (error) {
    console.error("Failed to create settings:", error);
  }

  console.log("Local database ready at ./local.db");
  process.exit(0);
}

runMigrations().catch((err) => {
  console.error(err);
  process.exit(1);
});