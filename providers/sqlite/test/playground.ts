import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { SQLiteAFS } from "@aigne/afs-sqlite";
import type { PlaygroundSetup } from "@aigne/afs-testing";
import { sql } from "drizzle-orm";

async function createTables(afs: SQLiteAFS): Promise<void> {
  const db = await afs.getDatabase();
  await db.run(
    sql.raw(
      `CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE)`,
    ),
  );
  await db.run(
    sql.raw(
      `CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL, content TEXT)`,
    ),
  );
  await db.run(
    sql.raw(
      `CREATE TABLE scratch (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, value TEXT)`,
    ),
  );

  await db.run(sql.raw(`INSERT INTO users (name, email) VALUES ('Alice', 'alice@test.com')`));
  await db.run(sql.raw(`INSERT INTO users (name, email) VALUES ('Bob', 'bob@test.com')`));
  await db.run(
    sql.raw(`INSERT INTO posts (user_id, title, content) VALUES (1, 'First Post', 'Hello World')`),
  );
  await db.run(
    sql.raw(
      `INSERT INTO posts (user_id, title, content) VALUES (1, 'Second Post', 'More content')`,
    ),
  );
  await db.run(
    sql.raw(`INSERT INTO scratch (name, value) VALUES ('existing', 'existing content')`),
  );
  await db.run(sql.raw(`INSERT INTO scratch (name, value) VALUES ('toDelete', 'delete me')`));
}

export async function setupPlayground(tempDir: string): Promise<PlaygroundSetup> {
  const dir = join(tempDir, "sqlite-data");
  await mkdir(dir, { recursive: true });
  const dbPath = join(dir, "app.db");

  const provider = new SQLiteAFS({ url: `file:${dbPath}`, accessMode: "readwrite" });
  await provider.ensureInitialized();
  await createTables(provider);

  return {
    name: "SQLiteAFS",
    mountPath: "/sqlite",
    provider,
    uri: `sqlite://${dbPath}`,
    cleanup: async () => {},
  };
}
