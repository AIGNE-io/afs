#!/usr/bin/env bun

/**
 * Setup evaluation fixtures.
 *
 * Generates SQLite DB and filesystem layout from the canonical todos.json.
 * Run once before experiments: bun evaluation/scripts/setup-fixtures.ts
 */

import Database from "bun:sqlite";
// biome-ignore lint/style/noRestrictedImports: setup script
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: setup script
import { join } from "node:path";

const ROOT = join(import.meta.dirname!, "..");
const FIXTURES = join(ROOT, "fixtures");

// ── Load canonical data ──
const data = JSON.parse(readFileSync(join(FIXTURES, "todos.json"), "utf-8"));
const todos: any[] = data.todos;
const members: any[] = data.members;

// ── Generate FS layout ──
const fsDir = join(FIXTURES, "todos-fs");
mkdirSync(fsDir, { recursive: true });
for (const todo of todos) {
  writeFileSync(join(fsDir, `${todo.id}.json`), JSON.stringify(todo, null, 2));
}
console.log(`✓ FS fixtures: ${todos.length} files in ${fsDir}`);

// ── Generate SQLite DB ──
const dbPath = join(FIXTURES, "todos.db");
const db = new Database(dbPath);
db.run("DROP TABLE IF EXISTS todos");
db.run("DROP TABLE IF EXISTS members");

db.run(`CREATE TABLE todos (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  tags TEXT DEFAULT '[]',
  due_date TEXT,
  created_at TEXT,
  updated_at TEXT
)`);

db.run(`CREATE TABLE members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT
)`);

const insertTodo = db.prepare(
  "INSERT INTO todos (id, title, description, status, priority, tags, due_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
);
for (const t of todos) {
  insertTodo.run(
    t.id,
    t.title,
    t.description,
    t.status,
    t.priority,
    JSON.stringify(t.tags),
    t.dueDate,
    t.createdAt,
    t.updatedAt,
  );
}

const insertMember = db.prepare("INSERT INTO members (id, name, role) VALUES (?, ?, ?)");
for (const m of members) {
  insertMember.run(m.id, m.name, m.role);
}

db.close();
console.log(`✓ SQLite: ${dbPath} (${todos.length} todos, ${members.length} members)`);

console.log("\nFixtures ready. Run experiments with: bun evaluation/scripts/run-all.ts");
