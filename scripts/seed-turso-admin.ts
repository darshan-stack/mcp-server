import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../server/local-schema";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:./local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = drizzle(client, { schema });

async function seedAdminUser() {
  console.log("Seeding admin user in Turso/local DB...");
  
  // Check if local_owner exists
  const existing = await db.select().from(schema.users).where(eq(schema.users.openId, "local_owner")).limit(1);
  
  if (!existing[0]) {
    await db.insert(schema.users).values({
      id: 1,
      openId: "local_owner",
      name: "Owner",
      email: null,
      loginMethod: "local",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    });
    console.log("✓ Created local_owner admin user");
  } else if (existing[0].role !== "admin") {
    await db.update(schema.users).set({ role: "admin" }).where(eq(schema.users.openId, "local_owner"));
    console.log("✓ Updated local_owner to admin role");
  } else {
    console.log("✓ Admin user already exists");
  }

  // Ensure settings exist
  const settings = await db.select().from(schema.postSettings).where(eq(schema.postSettings.userId, 1)).limit(1);
  if (!settings[0]) {
    await db.insert(schema.postSettings).values({
      userId: 1,
      topics: "software development, open source, learning in public, practical developer lessons, and developer life",
      tone: "first-person developer journal: candid, conversational, concise, lightly humorous",
      paused: 0,
    });
    console.log("✓ Created default settings");
  }

  console.log("Database seeded successfully");
  process.exit(0);
}

import { eq } from "drizzle-orm";
seedAdminUser().catch((err) => {
  console.error(err);
  process.exit(1);
});