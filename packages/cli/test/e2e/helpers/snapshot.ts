/**
 * Snapshot helpers - utilities for stable snapshot testing
 */

/**
 * Remove timestamps from output for stable snapshots.
 * Matches common timestamp formats without requiring specific prefixes.
 *
 * Note: We intentionally do NOT normalize paths - if OS paths appear in output,
 * tests should fail to expose the bug.
 */
export function removeTimestamps(output: string): string {
  return (
    output
      // ISO 8601 timestamps with timezone offset: 2026-02-05T22:36:34+08:00
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)/g, "[TIMESTAMP]")
      // Unix timestamps (milliseconds): 1738199334000
      .replace(/\b\d{13}\b/g, "[TIMESTAMP]")
      // Localized date format: 1/29/2026, 11:08:54 PM
      .replace(/\d{1,2}\/\d{1,2}\/\d{4},?\s+\d{1,2}:\d{2}:\d{2}\s*(AM|PM)?/gi, "[TIMESTAMP]")
      // Git commit hashes (full 40-char SHA)
      .replace(/\b[0-9a-f]{40}\b/g, "[HASH]")
      // Git short hashes (7-char, only when preceded by common prefixes)
      .replace(/"shortHash":\s*"[0-9a-f]{7,}"/g, '"shortHash": "[SHORT_HASH]"')
      // Git short hashes in markdown explain output: **Commit:** abc1234 or **HEAD Commit:** abc1234
      .replace(/(\*\*(?:HEAD )?Commit:\*\*\s*)[0-9a-f]{7,}/g, "$1[SHORT_HASH]")
  );
}

/**
 * Remove volatile fields from JSON output for stable snapshots.
 * Strips "modified" timestamps and directory "size" (varies cross-platform).
 */
export function removeVolatileJsonFields(jsonStr: string): string {
  const data = JSON.parse(jsonStr);
  const strip = (obj: unknown): unknown => {
    if (Array.isArray(obj)) return obj.map(strip);
    if (obj && typeof obj === "object") {
      const rec = obj as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rec)) {
        if (key === "modified") continue;
        if (key === "size" && "childrenCount" in rec) continue;
        result[key] = strip(value);
      }
      return result;
    }
    return obj;
  };
  return JSON.stringify(strip(data), null, 2);
}

/**
 * Normalize directory sizes in text output for cross-platform snapshot stability.
 * Directory sizes vary between macOS (content size e.g. 160B) and Linux (block size 4.0KB).
 *
 * Handles four formats:
 * - Human ls view:     "📁 docs (afs:node)  160B" → strip trailing size
 * - LLM ls view:       "ENTRY /fs/docs ... SIZE=160 CHILDREN=2" → strip SIZE=nnn
 * - Human read/stat:   "  size: 160" in metadata blocks with childrenCount → strip size line
 * - LLM read view:     "SIZE 160" in blocks with CHILDREN → strip SIZE line
 */
export function removeDirSizes(output: string): string {
  // Pass 1: inline formats
  let result = output
    // Human ls view: 📁 lines with trailing size
    .replace(/(📁.*\))\s+[\d.]+[BKMGT]i?B?\s*$/gm, "$1")
    // LLM ls view: SIZE=nnn on lines that have CHILDREN= (directories)
    .replace(/^(ENTRY .+) SIZE=\d+( CHILDREN=\d+)$/gm, "$1$2");

  // Pass 2: metadata blocks — strip directory size lines from blocks containing children info
  // Split by double-newline (block separator) and process each block
  const blocks = result.split(/\n\n/);
  result = blocks
    .map((block) => {
      if (block.includes("childrenCount:") || block.includes("CHILDREN")) {
        return block
          .replace(/^ {2}size: \d+\n/m, "") // human read: "  size: 160"
          .replace(/^SIZE \d+\n?/m, ""); // LLM read: "SIZE 160"
      }
      return block;
    })
    .join("\n\n");

  return result;
}

/**
 * Convert path to snapshot-friendly identifier
 */
export function pathToId(path: string): string {
  if (path === "/") return "root";
  return path.slice(1).replace(/\//g, "-").replace(/\./g, "_");
}
