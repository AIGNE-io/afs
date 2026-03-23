/**
 * AFS MCP Tools Registration
 *
 * Registers AFS operations as MCP tools.
 */

import type { AFS } from "@aigne/afs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatBatchDeleteOutput, formatDeleteOutput } from "../core/formatters/delete.js";
import { formatExecOutput } from "../core/formatters/exec.js";
import { formatLsOutput } from "../core/formatters/ls.js";
import { formatReadOutput } from "../core/formatters/read.js";
import { formatStatOutput } from "../core/formatters/stat.js";
import { formatBatchWriteOutput, formatWriteOutput } from "../core/formatters/write.js";
import { cliPathToCanonical } from "../path-utils.js";
import { EXEC_TIMEOUT_MS, errorResult, TOOL_TIMEOUT_MS, textResult, withTimeout } from "./utils.js";

/**
 * Register all AFS tools on the MCP server.
 */
export function registerTools(server: McpServer, afs: AFS): void {
  // afs_read - Read content at a path
  server.tool(
    "afs_read",
    "Read content at an AFS path",
    {
      path: z.string().describe("AFS path to read, e.g. /modules/fs/README.md or $afs:ns/path"),
      startLine: z.number().int().optional().describe("Start line (1-indexed, inclusive)"),
      endLine: z
        .number()
        .int()
        .optional()
        .describe("End line (1-indexed, inclusive). -1 for end of file"),
    },
    async ({ path, startLine, endLine }) => {
      try {
        const canonicalPath = cliPathToCanonical(path);
        const result = await withTimeout(() => afs.read(canonicalPath, { startLine, endLine }));
        if (!result.data) {
          return {
            isError: true as const,
            content: [{ type: "text" as const, text: result.message || "Not found" }],
          };
        }
        const formatted = formatReadOutput(result, "llm", { path });
        return textResult(formatted);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // afs_list - List directory contents
  server.tool(
    "afs_list",
    "List directory contents at an AFS path",
    {
      path: z.string().describe("AFS path to list"),
      depth: z.number().optional().describe("Recursion depth, default 1"),
      pattern: z.string().optional().describe("Filter pattern, e.g. *.md"),
      limit: z.number().optional().describe("Max entries to return"),
    },
    async ({ path, depth, pattern, limit }) => {
      try {
        const canonicalPath = cliPathToCanonical(path);
        const result = await withTimeout(() =>
          afs.list(canonicalPath, {
            maxDepth: depth ?? 1,
            pattern,
            limit,
          }),
        );
        if (result.data.length === 0 && result.message) {
          return {
            isError: true as const,
            content: [{ type: "text" as const, text: result.message }],
          };
        }
        const formatted = formatLsOutput(result, "llm", { path });
        return textResult(formatted);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // afs_write - Write content to a path (supports batch via entries)
  server.tool(
    "afs_write",
    "Write content to an AFS path. Supports batch mode via 'entries' for writing multiple files in one call.",
    {
      path: z
        .string()
        .optional()
        .describe("AFS path to write to (ignored when entries is provided)"),
      content: z
        .union([z.string(), z.record(z.string(), z.unknown())])
        .optional()
        .describe("Content to write (string or JSON object)"),
      mode: z
        .enum(["replace", "append", "prepend", "patch", "create", "update"])
        .optional()
        .default("replace")
        .describe("Write mode: replace (default), append, prepend, or patch"),
      patches: z
        .array(
          z.object({
            op: z.enum(["str_replace", "insert_before", "insert_after", "delete"]),
            target: z.string().describe("Unique string to locate in the file"),
            content: z.string().optional().default("").describe("Replacement/insertion content"),
          }),
        )
        .optional()
        .describe("Patch operations (only used with mode=patch)"),
      entries: z
        .array(
          z.object({
            path: z.string().describe("AFS path to write to"),
            content: z
              .union([z.string(), z.record(z.string(), z.unknown())])
              .optional()
              .describe("Content to write"),
            mode: z
              .enum(["replace", "append", "prepend", "patch", "create", "update"])
              .optional()
              .describe("Write mode (default: replace)"),
            patches: z
              .array(
                z.object({
                  op: z.enum(["str_replace", "insert_before", "insert_after", "delete"]),
                  target: z.string(),
                  content: z.string().optional().default(""),
                }),
              )
              .optional(),
          }),
        )
        .optional()
        .describe(
          "Batch mode: array of write entries. When provided, top-level path/content/mode are ignored. Each entry is independent — failures don't abort other entries.",
        ),
    },
    async ({ path, content, mode, patches, entries }) => {
      try {
        // Batch mode
        if (entries && entries.length > 0) {
          const batchEntries = entries.map((e) => ({
            path: cliPathToCanonical(e.path),
            content: e.content !== undefined ? { content: e.content } : undefined,
            mode: e.mode as
              | "replace"
              | "append"
              | "prepend"
              | "patch"
              | "create"
              | "update"
              | undefined,
            patches: e.patches,
          }));
          const timeoutMs = TOOL_TIMEOUT_MS * Math.min(entries.length, 10);
          const result = await withTimeout(() => afs.batchWrite(batchEntries), timeoutMs);
          return textResult(formatBatchWriteOutput(result, "llm"));
        }

        // Single mode (existing logic)
        if (!path) {
          return errorResult(
            new Error("path is required for single write (or use entries for batch)"),
          );
        }
        const canonicalPath = cliPathToCanonical(path);
        const payload: Record<string, unknown> = {};
        if (content !== undefined) payload.content = content;
        if (patches) payload.patches = patches;
        const result = await withTimeout(() => afs.write(canonicalPath, payload, { mode }));
        const formatted = formatWriteOutput(result, "llm");
        return textResult(formatted);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // afs_delete - Delete paths (supports batch via entries)
  server.tool(
    "afs_delete",
    "Delete files at AFS paths. Supports batch mode via 'entries' for deleting multiple files in one call.",
    {
      path: z.string().optional().describe("AFS path to delete (ignored when entries is provided)"),
      recursive: z.boolean().optional().describe("Delete recursively"),
      entries: z
        .array(
          z.object({
            path: z.string().describe("AFS path to delete"),
            recursive: z.boolean().optional(),
          }),
        )
        .optional()
        .describe(
          "Batch mode: array of delete entries. When provided, top-level path is ignored. Each entry is independent — failures don't abort other entries.",
        ),
    },
    async ({ path, recursive, entries }) => {
      try {
        // Batch mode
        if (entries && entries.length > 0) {
          const batchEntries = entries.map((e) => ({
            path: cliPathToCanonical(e.path),
            recursive: e.recursive,
          }));
          const timeoutMs = TOOL_TIMEOUT_MS * Math.min(entries.length, 10);
          const result = await withTimeout(() => afs.batchDelete(batchEntries), timeoutMs);
          return textResult(formatBatchDeleteOutput(result, "llm"));
        }

        // Single mode (existing logic)
        if (!path) {
          return errorResult(
            new Error("path is required for single delete (or use entries for batch)"),
          );
        }
        const canonicalPath = cliPathToCanonical(path);
        const result = await withTimeout(() => afs.delete(canonicalPath, { recursive }));
        const formatted = formatDeleteOutput(result, "llm", { path });
        return textResult(formatted);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // afs_search - Search for content
  server.tool(
    "afs_search",
    "Search for content within an AFS path",
    {
      path: z.string().describe("Base path to search from"),
      query: z.string().describe("Search query"),
      pattern: z.string().optional().describe("File pattern filter"),
      limit: z.number().optional().describe("Max results"),
    },
    async ({ path, query, limit }) => {
      try {
        const canonicalPath = cliPathToCanonical(path);
        const result = await withTimeout(() => afs.search(canonicalPath, query, { limit }));
        // Search results use list formatter
        const formatted = formatLsOutput(result as any, "llm", { path });
        return textResult(formatted);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // afs_exec - Execute an action
  server.tool(
    "afs_exec",
    "Execute an action. Use afs_list on {path}/.actions to discover available actions and their inputSchema.",
    {
      path: z.string().describe("Action path, e.g. /modules/sqlite/users/.actions/insert"),
      args: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Action arguments matching the action's inputSchema"),
    },
    async ({ path, args }) => {
      try {
        const canonicalPath = cliPathToCanonical(path);
        const result = await withTimeout(
          () => afs.exec(canonicalPath, args ?? {}),
          EXEC_TIMEOUT_MS,
        );
        const formatted = formatExecOutput(result, "llm", { path });
        return textResult(formatted);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // afs_stat - Get path metadata
  server.tool(
    "afs_stat",
    "Get metadata for an AFS path",
    { path: z.string().describe("AFS path to stat") },
    async ({ path }) => {
      try {
        const canonicalPath = cliPathToCanonical(path);
        const result = await withTimeout(() => afs.stat(canonicalPath));
        if (!result.data) {
          return {
            isError: true as const,
            content: [{ type: "text" as const, text: result.message || "Not found" }],
          };
        }
        const formatted = formatStatOutput(result, "llm");
        return textResult(formatted);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // afs_explain - Get human-readable explanation
  server.tool(
    "afs_explain",
    "Get a human-readable explanation for an AFS path or topic",
    { path: z.string().describe("AFS path or topic to explain") },
    async ({ path }) => {
      try {
        const canonicalPath = cliPathToCanonical(path);
        const result = await withTimeout(() => afs.explain(canonicalPath));
        // explain returns { format, content } directly
        return textResult(result.content);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
