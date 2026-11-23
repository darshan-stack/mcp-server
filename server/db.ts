import { and, desc, eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, Post, PostSettings, postSettings, posts, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

function requireDb(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) throw new Error("Database is not available");
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = requireDb(await getDb());
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      const value = user[field] ?? null;
      values[field] = value;
      updateSet[field] = value;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = requireDb(await getDb());
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function listPosts(userId: number, limit = 100): Promise<Post[]> {
  const db = requireDb(await getDb());
  return db.select().from(posts).where(eq(posts.userId, userId)).orderBy(desc(posts.createdAt)).limit(limit);
}

export async function getPostForUser(id: number, userId: number): Promise<Post | undefined> {
  const db = requireDb(await getDb());
  const result = await db.select().from(posts).where(and(eq(posts.id, id), eq(posts.userId, userId))).limit(1);
  return result[0];
}

export async function getPendingPost(userId: number): Promise<Post | undefined> {
  const db = requireDb(await getDb());
  const result = await db.select().from(posts).where(and(eq(posts.userId, userId), eq(posts.status, "pending"))).orderBy(posts.createdAt).limit(1);
  return result[0];
}

export async function getPostBySlot(slotKey: string): Promise<Post | undefined> {
  const db = requireDb(await getDb());
  const result = await db.select().from(posts).where(eq(posts.slotKey, slotKey)).limit(1);
  return result[0];
}

export async function createPost(input: {
  userId: number;
  content: string;
  category: string;
  source: "ai" | "manual";
  slotKey?: string | null;
}): Promise<Post> {
  const db = requireDb(await getDb());
  await db.insert(posts).values({ ...input, status: "pending" });
  const rows = await db.select().from(posts).where(eq(posts.userId, input.userId)).orderBy(desc(posts.id)).limit(1);
  if (!rows[0]) throw new Error("Draft could not be read after creation");
  return rows[0];
}

export async function updatePendingPost(input: { id: number; userId: number; content?: string; status?: "rejected" | "publishing" | "published" | "failed" | "unknown"; xPostId?: string | null; errorMessage?: string | null; approvedAt?: Date | null; publishedAt?: Date | null }) {
  const db = requireDb(await getDb());
  const { id, userId, ...values } = input;
  return db.transaction(async tx => {
    const rows = await tx.select().from(posts).where(and(eq(posts.id, id), eq(posts.userId, userId))).limit(1).for("update");
    if (!rows[0] || rows[0].status !== "pending") return false;
    await tx.update(posts).set(values).where(and(eq(posts.id, id), eq(posts.userId, userId), eq(posts.status, "pending")));
    return true;
  });
}

export async function updatePublishingPost(input: { id: number; userId: number; status: "published" | "failed" | "unknown"; xPostId?: string | null; errorMessage?: string | null; publishedAt?: Date | null }) {
  const db = requireDb(await getDb());
  const { id, userId, ...values } = input;
  await db.update(posts).set(values).where(and(eq(posts.id, id), eq(posts.userId, userId), eq(posts.status, "publishing")));
}

export async function getSettings(userId: number): Promise<PostSettings> {
  const db = requireDb(await getDb());
  await db.insert(postSettings).values({
    userId,
    topics: "software development, open source, learning in public, practical developer lessons, and developer life",
    tone: "first-person developer journal: candid, conversational, concise, lightly humorous",
  }).onDuplicateKeyUpdate({ set: { userId } });
  const rows = await db.select().from(postSettings).where(eq(postSettings.userId, userId)).limit(1);
  if (!rows[0]) throw new Error("Post settings are unavailable");
  return rows[0];
}

export async function updateSettings(userId: number, input: { topics?: string; tone?: string; paused?: number }) {
  const db = requireDb(await getDb());
  await getSettings(userId);
  await db.update(postSettings).set(input).where(eq(postSettings.userId, userId));
  return getSettings(userId);
}

export async function setGenerationTaskUid(userId: number, taskUid: string | null) {
  const db = requireDb(await getDb());
  await getSettings(userId);
  await db.update(postSettings).set({ generationTaskUid: taskUid }).where(eq(postSettings.userId, userId));
  return getSettings(userId);
}

export async function getSettingsByTaskUid(taskUid: string): Promise<PostSettings | undefined> {
  const db = requireDb(await getDb());
  const rows = await db.select().from(postSettings).where(and(eq(postSettings.generationTaskUid, taskUid), isNotNull(postSettings.generationTaskUid))).limit(1);
  return rows[0];
}
