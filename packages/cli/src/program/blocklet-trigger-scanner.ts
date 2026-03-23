/**
 * Trigger Scanner — scans program directories for .ash scripts with
 * @on (event) and @cron trigger declarations.
 *
 * Uses dependency injection for the compile function to avoid direct
 * @aigne/ash dependency. The caller provides compileSource.
 */

import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { type BlockletManifest, parseBlockletManifest } from "@aigne/afs";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TriggerInfo {
  kind: "event" | "cron";
  /** For event triggers: the AFS path to watch */
  path?: string;
  /** For event triggers: the event type (e.g., "created", "deleted") */
  event?: string;
  /** For cron triggers: the cron expression */
  expression?: string;
}

export interface ScriptTriggerInfo {
  /** Relative path to the .ash script from program root */
  scriptPath: string;
  /** Job name in the script */
  jobName: string;
  /** Trigger declaration */
  trigger: TriggerInfo;
}

export interface BlockletTriggerInfo {
  /** Parsed program manifest */
  manifest: BlockletManifest;
  /** All trigger declarations found across scripts */
  triggers: ScriptTriggerInfo[];
}

/**
 * Compile function signature — matches @aigne/ash compileSource.
 * Accepts ASH source code, returns compiled program with trigger info.
 */
export type CompileFn = (source: string) => {
  program?: {
    units: Array<{
      kind: string;
      name: string;
      trigger?: {
        kind: string;
        path?: string;
        event?: string;
        expression?: string;
      };
    }>;
  };
  diagnostics: Array<{ message?: string }>;
};

// ─── Implementation ─────────────────────────────────────────────────────────

/**
 * Scan a program directory for .ash scripts containing trigger declarations.
 *
 * @param programDir - Absolute filesystem path to the program directory
 * @param compile - Compile function (typically compileSource from @aigne/ash).
 *                  If null, falls back to regex-based extraction from source.
 * @returns BlockletTriggerInfo if any triggers found, null otherwise
 * @throws If programDir doesn't exist, or program.yaml is missing/invalid
 */
export async function scanBlockletTriggers(
  programDir: string,
  compile: CompileFn | null,
): Promise<BlockletTriggerInfo | null> {
  const resolvedDir = resolve(programDir);

  // 1. Verify directory exists
  try {
    const s = await stat(resolvedDir);
    if (!s.isDirectory()) {
      throw new Error(`Program path is not a directory: ${resolvedDir}`);
    }
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new Error(`Program directory does not exist: ${resolvedDir}`);
    }
    throw err;
  }

  // 2. Read and validate blocklet.yaml or program.yaml
  let yamlContent: string | undefined;
  for (const filename of ["blocklet.yaml", "program.yaml"]) {
    const manifestPath = join(resolvedDir, filename);
    try {
      yamlContent = await readFile(manifestPath, "utf-8");
      break;
    } catch (err: any) {
      if (err.code !== "ENOENT") throw err;
    }
  }
  if (!yamlContent) {
    throw new Error("blocklet.yaml not found in blocklet directory");
  }
  const manifest = parseBlockletManifest(yamlContent);

  // 3. Recursively find all .ash files
  const ashFiles = await findAshFiles(resolvedDir, resolvedDir);
  if (ashFiles.length === 0) {
    return null;
  }

  // 4. Compile each script and extract triggers
  const triggers: ScriptTriggerInfo[] = [];

  for (const relPath of ashFiles) {
    const fullPath = join(resolvedDir, relPath);
    let source: string;
    try {
      source = await readFile(fullPath, "utf-8");
    } catch {
      continue; // Skip unreadable files
    }

    // Skip empty files
    if (!source.trim()) {
      continue;
    }

    // Extract triggers: use compiler if available, otherwise regex fallback
    try {
      if (compile) {
        const result = compile(source);
        if (!result.program) {
          continue; // Compilation failed — skip
        }
        for (const unit of result.program.units) {
          if (unit.kind !== "job" || !unit.trigger) continue;
          triggers.push({
            scriptPath: relPath,
            jobName: unit.name,
            trigger: {
              kind: unit.trigger.kind as "event" | "cron",
              path: unit.trigger.path,
              event: unit.trigger.event,
              expression: unit.trigger.expression,
            },
          });
        }
      } else {
        // Regex fallback: extract @on and @cron from source text
        const extracted = extractTriggersFromSource(source, relPath);
        triggers.push(...extracted);
      }
    } catch {}
  }

  if (triggers.length === 0) {
    return null;
  }

  return { manifest, triggers };
}

/**
 * Scan a data directory for .ash scripts containing trigger declarations.
 * Unlike scanBlockletTriggers, this does NOT require a blocklet.yaml manifest.
 * Script paths are prefixed with the given virtualPrefix (e.g. "scripts/")
 * so they resolve correctly under /data in the runtime AFS.
 *
 * @param dataDir - Absolute filesystem path to the data directory
 * @param compile - Compile function (typically compileSource from @aigne/ash)
 * @param virtualPrefix - Path prefix for scriptPath (default: "scripts/")
 * @returns Array of ScriptTriggerInfo (may be empty)
 */
export async function scanDataScriptTriggers(
  dataDir: string,
  compile: CompileFn | null,
  virtualPrefix = "scripts/",
): Promise<ScriptTriggerInfo[]> {
  const scriptsDir = join(dataDir, "scripts");
  try {
    const s = await stat(scriptsDir);
    if (!s.isDirectory()) return [];
  } catch {
    return []; // scripts/ doesn't exist — fine
  }

  const ashFiles = await findAshFiles(scriptsDir, scriptsDir);
  const triggers: ScriptTriggerInfo[] = [];

  for (const relPath of ashFiles) {
    const fullPath = join(scriptsDir, relPath);
    let source: string;
    try {
      source = await readFile(fullPath, "utf-8");
    } catch {
      continue;
    }
    if (!source.trim()) continue;

    try {
      if (compile) {
        const result = compile(source);
        if (!result.program) continue;
        for (const unit of result.program.units) {
          if (unit.kind !== "job" || !unit.trigger) continue;
          triggers.push({
            scriptPath: virtualPrefix + relPath,
            jobName: unit.name,
            trigger: {
              kind: unit.trigger.kind as "event" | "cron",
              path: unit.trigger.path,
              event: unit.trigger.event,
              expression: unit.trigger.expression,
            },
          });
        }
      } else {
        const extracted = extractTriggersFromSource(source, virtualPrefix + relPath);
        triggers.push(...extracted);
      }
    } catch {}
  }

  return triggers;
}

/**
 * Recursively find all .ash files under a directory.
 * Skips symlinks that resolve outside the root directory.
 * Returns paths relative to rootDir.
 */
async function findAshFiles(dir: string, rootDir: string): Promise<string[]> {
  const results: string[] = [];
  let entries: Dirent<string>[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })) as Dirent<string>[];
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    // Security: check for symlinks that point outside the program directory
    if (entry.isSymbolicLink()) {
      try {
        const realPath = await import("node:fs/promises").then((fs) => fs.realpath(fullPath));
        if (!isPathInsideRoot(realPath, rootDir)) {
          continue; // Skip symlinks that escape the program directory
        }
        // Check if it's a directory or file after resolving
        const s = await stat(realPath);
        if (s.isDirectory()) {
          const subResults = await findAshFiles(fullPath, rootDir);
          results.push(...subResults);
        } else if (s.isFile() && entry.name.endsWith(".ash")) {
          results.push(relative(rootDir, fullPath));
        }
      } catch {
        continue; // Skip broken symlinks
      }
      continue;
    }

    if (entry.isDirectory()) {
      const subResults = await findAshFiles(fullPath, rootDir);
      results.push(...subResults);
    } else if (entry.isFile() && entry.name.endsWith(".ash")) {
      results.push(relative(rootDir, fullPath));
    }
  }

  return results.sort();
}

function isPathInsideRoot(targetPath: string, rootDir: string): boolean {
  const rel = relative(rootDir, targetPath);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

// ─── Regex Fallback ────────────────────────────────────────────────────────

/**
 * Extract triggers from ASH source using regex.
 * Matches ASH trigger syntax:
 *   job name on /path:event { ... }
 *   job name on cron("expression") { ... }
 */
export function extractTriggersFromSource(source: string, relPath: string): ScriptTriggerInfo[] {
  const results: ScriptTriggerInfo[] = [];
  const lines = source.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Match: job <name> on /path:event {  (path can be just "/" for root)
    const eventMatch = trimmed.match(/^job\s+(\w+)\s+on\s+(\/[^\s:]*):(\w+)\s*\{/);
    if (eventMatch) {
      results.push({
        scriptPath: relPath,
        jobName: eventMatch[1]!,
        trigger: {
          kind: "event",
          path: eventMatch[2],
          event: eventMatch[3],
        },
      });
      continue;
    }

    // Match: job <name> on cron("expression") {
    const cronMatch = trimmed.match(/^job\s+(\w+)\s+on\s+cron\(\s*"([^"]+)"\s*\)\s*\{/);
    if (cronMatch) {
      results.push({
        scriptPath: relPath,
        jobName: cronMatch[1]!,
        trigger: {
          kind: "cron",
          expression: cronMatch[2],
        },
      });
    }
  }

  return results;
}
