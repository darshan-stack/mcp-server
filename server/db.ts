import { and, desc, eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, Post, PostSettings, User, postSettings, posts, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { ensureTursoAppSchema } from "./turso-schema";

// MySQL database (production - traditional)
let _mysqlDb: ReturnType<typeof drizzle> | null = null;

export async function getMysqlDb() {
  if (!_mysqlDb && process.env.DATABASE_URL) {
    try {
      _mysqlDb = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect to MySQL:", error);
      _mysqlDb = null;
    }
  }
  return _mysqlDb;
}

// Turso/libSQL database (production - Turso Cloud)
let _tursoDb: { db: any; schema: any } | null = null;

export async function getTursoDb() {
  if (!_tursoDb && process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    try {
      const { createClient } = await import("@libsql/client");
      const { drizzle } = await import("drizzle-orm/libsql");
      const schema = await import("./local-schema");
      
      const client = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      });
      await ensureTursoAppSchema(client);
      
      _tursoDb = {
        db: drizzle(client, { schema }),
        schema,
      };
      console.log("[Database] Connected to Turso");
    } catch (error) {
      console.warn("[Database] Failed to connect to Turso:", error);
      _tursoDb = null;
    }
  }
  return _tursoDb;
}

// Local SQLite database (development)
let _localDb: { db: any; schema: any } | null = null;

export async function getLocalDb() {
  if (!_localDb) {
    const { createClient } = await import("@libsql/client");
    const { drizzle } = await import("drizzle-orm/libsql");
    const schema = await import("./local-schema");
    
    const client = createClient({
      url: "file:./local.db",
    });
    
    _localDb = {
      db: drizzle(client, { schema }),
      schema,
    };
  }
  return _localDb;
}

async function getActiveDb() {
  // Priority: Turso > MySQL > Local SQLite
  const tursoDb = await getTursoDb();
  if (tursoDb) return { db: tursoDb.db, schema: tursoDb.schema, isMysql: false, isTurso: true };
  
  const mysqlDb = await getMysqlDb();
  if (mysqlDb) return { db: mysqlDb, schema: null, isMysql: true, isTurso: false };
  
  const localDb = await getLocalDb();
  return { db: localDb.db, schema: localDb.schema, isMysql: false, isTurso: false };
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const { db, schema, isMysql } = await getActiveDb();
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

  if (isMysql) {
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } else {
    const existing = await db.select().from(schema.users).where(eq(schema.users.openId, user.openId)).limit(1);
    if (existing[0]) {
      await db.update(schema.users).set(updateSet).where(eq(schema.users.openId, user.openId));
    } else {
      await db.insert(schema.users).values(values);
    }
  }
}

export async function getUserByOpenId(openId: string) {
  const { db, schema, isMysql } = await getActiveDb();
  if (isMysql) {
    const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
    return result[0];
  } else {
    const result = await db.select().from(schema.users).where(eq(schema.users.openId, openId)).limit(1);
    return result[0];
  }
}

export async function ensureLocalOwner(): Promise<User> {
  const { db, schema, isMysql } = await getActiveDb();
  const findById = async () => isMysql
    ? (await db.select().from(users).where(eq(users.id, 1)).limit(1))[0]
    : (await db.select().from(schema.users).where(eq(schema.users.id, 1)).limit(1))[0];
  const existingIdOne = await findById();
  if (existingIdOne) return existingIdOne as User;

  const existingOwner = await getUserByOpenId("owner");
  if (existingOwner) return existingOwner as User;

  const values: InsertUser = {
    id: 1,
    openId: "owner",
    name: "Owner",
    loginMethod: "local",
    role: "admin",
  };
  try {
    if (isMysql) {
      await db.insert(users).values(values);
    } else {
      await db.insert(schema.users).values(values);
    }
  } catch (error) {
    // Concurrent cold starts may both try to create the same owner row.
    const winner = await findById() ?? await getUserByOpenId("owner");
    if (winner) return winner as User;
    throw error;
  }

  const owner = await getUserByOpenId("owner");
  if (!owner) throw new Error("Local owner could not be created");
  return owner as User;
}

export async function listPosts(userId: number, limit = 100): Promise<Post[]> {
  const { db, schema, isMysql } = await getActiveDb();
  if (isMysql) {
    return db.select().from(posts).where(eq(posts.userId, userId)).orderBy(desc(posts.createdAt)).limit(limit);
  } else {
    return db.select().from(schema.posts).where(eq(schema.posts.userId, userId)).orderBy(desc(schema.posts.createdAt)).limit(limit);
  }
}

export async function getPostForUser(id: number, userId: number): Promise<Post | undefined> {
  const { db, schema, isMysql } = await getActiveDb();
  if (isMysql) {
    const result = await db.select().from(posts).where(and(eq(posts.id, id), eq(posts.userId, userId))).limit(1);
    return result[0];
  } else {
    const result = await db.select().from(schema.posts).where(and(eq(schema.posts.id, id), eq(schema.posts.userId, userId))).limit(1);
    return result[0];
  }
}

export async function getPendingPost(userId: number): Promise<Post | undefined> {
  const { db, schema, isMysql } = await getActiveDb();
  if (isMysql) {
    const result = await db.select().from(posts).where(and(eq(posts.userId, userId), eq(posts.status, "pending"))).orderBy(posts.createdAt).limit(1);
    return result[0];
  } else {
    const result = await db.select().from(schema.posts).where(and(eq(schema.posts.userId, userId), eq(schema.posts.status, "pending"))).orderBy(schema.posts.createdAt).limit(1);
    return result[0];
  }
}

export async function getPostBySlot(slotKey: string): Promise<Post | undefined> {
  const { db, schema, isMysql } = await getActiveDb();
  if (isMysql) {
    const result = await db.select().from(posts).where(eq(posts.slotKey, slotKey)).limit(1);
    return result[0];
  } else {
    const result = await db.select().from(schema.posts).where(eq(schema.posts.slotKey, slotKey)).limit(1);
    return result[0];
  }
}

export async function createPost(input: {
  userId: number;
  content: string;
  category: string;
  source: "ai" | "manual";
  slotKey?: string | null;
}): Promise<Post> {
  const { db, schema, isMysql } = await getActiveDb();
  const values = { ...input, status: "pending" };
  
  if (isMysql) {
    await db.insert(posts).values(values);
    const rows = await db.select().from(posts).where(eq(posts.userId, input.userId)).orderBy(desc(posts.id)).limit(1);
    if (!rows[0]) throw new Error("Draft could not be read after creation");
    return rows[0];
  } else {
    await db.insert(schema.posts).values(values);
    const rows = await db.select().from(schema.posts).where(eq(schema.posts.userId, input.userId)).orderBy(desc(schema.posts.id)).limit(1);
    if (!rows[0]) throw new Error("Draft could not be read after creation");
    return rows[0];
  }
}

export async function updatePendingPost(input: { id: number; userId: number; content?: string; status?: "rejected" | "publishing" | "published" | "failed" | "unknown"; xPostId?: string | null; errorMessage?: string | null; approvedAt?: Date | null; publishedAt?: Date | null }) {
  const { db, schema, isMysql } = await getActiveDb();
  const { id, userId, ...values } = input;
  
  if (isMysql) {
    return db.transaction(async (tx: any) => {
      const rows = await tx.select().from(posts).where(and(eq(posts.id, id), eq(posts.userId, userId))).limit(1).for("update");
      if (!rows[0] || rows[0].status !== "pending") return false;
      await tx.update(posts).set(values).where(and(eq(posts.id, id), eq(posts.userId, userId), eq(posts.status, "pending")));
      return true;
    });
  } else {
    const rows = await db.select().from(schema.posts).where(and(eq(schema.posts.id, id), eq(schema.posts.userId, userId))).limit(1);
    if (!rows[0] || rows[0].status !== "pending") return false;
    await db.update(schema.posts).set(values).where(and(eq(schema.posts.id, id), eq(schema.posts.userId, userId), eq(schema.posts.status, "pending")));
    return true;
  }
}

export async function updatePublishingPost(input: { id: number; userId: number; status: "published" | "failed" | "unknown"; xPostId?: string | null; errorMessage?: string | null; publishedAt?: Date | null }) {
  const { db, schema, isMysql } = await getActiveDb();
  const { id, userId, ...values } = input;
  
  if (isMysql) {
    await db.update(posts).set(values).where(and(eq(posts.id, id), eq(posts.userId, userId), eq(posts.status, "publishing")));
  } else {
    await db.update(schema.posts).set(values).where(and(eq(schema.posts.id, id), eq(schema.posts.userId, userId), eq(schema.posts.status, "publishing")));
  }
}

export async function getSettings(userId: number): Promise<PostSettings> {
  const { db, schema, isMysql } = await getActiveDb();
  
  if (isMysql) {
    await db.insert(postSettings).values({
      userId,
      topics: "software development, open source, learning in public, practical developer lessons, and developer life",
      tone: "first-person developer journal: candid, conversational, concise, lightly humorous",
    }).onDuplicateKeyUpdate({ set: { userId } });
    const rows = await db.select().from(postSettings).where(eq(postSettings.userId, userId)).limit(1);
    if (!rows[0]) throw new Error("Post settings are unavailable");
    return rows[0];
  } else {
    const existing = await db.select().from(schema.postSettings).where(eq(schema.postSettings.userId, userId)).limit(1);
    if (!existing[0]) {
      await db.insert(schema.postSettings).values({
        userId,
        topics: "software development, open source, learning in public, practical developer lessons, and developer life",
        tone: "first-person developer journal: candid, conversational, concise, lightly humorous",
      });
    }
    const rows = await db.select().from(schema.postSettings).where(eq(schema.postSettings.userId, userId)).limit(1);
    if (!rows[0]) throw new Error("Post settings are unavailable");
    return rows[0];
  }
}

export async function updateSettings(userId: number, input: { topics?: string; tone?: string; paused?: number }) {
  const { db, schema, isMysql } = await getActiveDb();
  
  if (isMysql) {
    await getSettings(userId);
    await db.update(postSettings).set(input).where(eq(postSettings.userId, userId));
    return getSettings(userId);
  } else {
    await getSettings(userId);
    await db.update(schema.postSettings).set(input).where(eq(schema.postSettings.userId, userId));
    const rows = await db.select().from(schema.postSettings).where(eq(schema.postSettings.userId, userId)).limit(1);
    return rows[0];
  }
}

export async function setGenerationTaskUid(userId: number, taskUid: string | null) {
  const { db, schema, isMysql } = await getActiveDb();
  
  if (isMysql) {
    await getSettings(userId);
    await db.update(postSettings).set({ generationTaskUid: taskUid }).where(eq(postSettings.userId, userId));
    return getSettings(userId);
  } else {
    await getSettings(userId);
    await db.update(schema.postSettings).set({ generationTaskUid: taskUid }).where(eq(schema.postSettings.userId, userId));
    const rows = await db.select().from(schema.postSettings).where(eq(schema.postSettings.userId, userId)).limit(1);
    return rows[0];
  }
}

export async function getSettingsByTaskUid(taskUid: string): Promise<PostSettings | undefined> {
  const { db, schema, isMysql } = await getActiveDb();
  
  if (isMysql) {
    const rows = await db.select().from(postSettings).where(and(eq(postSettings.generationTaskUid, taskUid), isNotNull(postSettings.generationTaskUid))).limit(1);
    return rows[0];
  } else {
    const rows = await db.select().from(schema.postSettings).where(and(eq(schema.postSettings.generationTaskUid, taskUid), isNotNull(schema.postSettings.generationTaskUid))).limit(1);
    return rows[0];
  }
}

export { schema as localSchema } from "./local-schema";
