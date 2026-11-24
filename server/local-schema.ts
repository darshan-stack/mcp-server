import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const currentTimestamp = sql`(unixepoch() * 1000)`;

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  openId: text("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: text("email", { length: 320 }),
  loginMethod: text("loginMethod", { length: 64 }),
  role: text("role", { enum: ["user", "admin"] }).default("user").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(currentTimestamp),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().default(currentTimestamp).$onUpdate(() => new Date()),
  lastSignedIn: integer("lastSignedIn", { mode: "timestamp" }).notNull().default(currentTimestamp),
});

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  category: text("category", { length: 32 }).notNull().default("manual"),
  source: text("source", { enum: ["ai", "manual"] }).notNull().default("manual"),
  status: text("status", { enum: ["pending", "publishing", "published", "rejected", "failed", "unknown"] }).notNull().default("pending"),
  slotKey: text("slotKey", { length: 40 }).unique(),
  xPostId: text("xPostId", { length: 32 }).unique(),
  errorMessage: text("errorMessage"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(currentTimestamp),
  approvedAt: integer("approvedAt", { mode: "timestamp" }),
  publishedAt: integer("publishedAt", { mode: "timestamp" }),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().default(currentTimestamp).$onUpdate(() => new Date()),
}, (table) => ({
  userIdIdx: index("posts_userId_idx").on(table.userId),
}));

export const postSettings = sqliteTable("postSettings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  topics: text("topics").notNull(),
  tone: text("tone").notNull(),
  paused: integer("paused").notNull().default(0),
  generationTaskUid: text("generationTaskUid", { length: 80 }),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(currentTimestamp),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().default(currentTimestamp).$onUpdate(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type PostSettings = typeof postSettings.$inferSelect;

export const schema = { users, posts, postSettings };
