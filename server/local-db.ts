import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./local-schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db) {
    // Use local SQLite file for development
    const client = createClient({
      url: "file:./local.db",
    });
    _db = drizzle(client, { schema });
  }
  return _db;
}

export { schema };